const express = require("express")
const router = express.Router()
const pool = require("../db")
const auth = require("../middleware/auth")

// Rota pública - listar todas as cidades (com filtro opcional por UF)
router.get("/", async (req, res) => {
    try {
        const { uf } = req.query
        console.log(`📥 GET /api/cidades ${uf ? `?uf=${uf}` : ''}`)
        
        let query = `
            SELECT 
                c.codigo_ibge,
                c.nome,
                e.uf,
                c.latitude,
                c.longitude,
                c.capital,
                c.ddd
            FROM cidades c
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
        `
        
        let params = []
        if (uf) {
            query += ` WHERE e.uf = $1`
            params = [uf.toUpperCase()]
        }
        
        query += ` ORDER BY c.nome`
        
        const result = await pool.query(query, params)
        console.log(`✅ ${result.rows.length} cidades encontradas`)
        res.json(result.rows)
        
    } catch (error) {
        console.error("❌ Erro ao listar cidades:", error)
        res.status(500).json({ error: "Erro ao listar cidades" })
    }
})

// Rota pública - listar cidades por UF (endpoint específico)
router.get("/uf/:uf", async (req, res) => {
    try {
        const { uf } = req.params
        console.log(`📥 GET /api/cidades/uf/${uf}`)
        
        const result = await pool.query(`
            SELECT 
                c.codigo_ibge,
                c.nome,
                e.uf,
                c.latitude,
                c.longitude,
                c.capital,
                c.ddd
            FROM cidades c
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE e.uf = $1
            ORDER BY c.nome
        `, [uf.toUpperCase()])
        
        console.log(`✅ ${result.rows.length} cidades em ${uf}`)
        res.json(result.rows)
        
    } catch (error) {
        console.error("❌ Erro ao listar cidades por UF:", error)
        res.status(500).json({ error: "Erro ao listar cidades por UF" })
    }
})

// Rota pública - buscar cidades por nome ou UF
router.get("/buscar", async (req, res) => {
    const { q } = req.query
    
    if (!q || q.length < 2) {
        return res.json([])
    }
    
    try {
        console.log(`📥 GET /api/cidades/buscar?q=${q}`)
        
        const result = await pool.query(`
            SELECT 
                c.codigo_ibge,
                c.nome,
                e.uf,
                c.latitude,
                c.longitude,
                c.capital,
                c.ddd
            FROM cidades c
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE c.nome ILIKE $1 OR e.uf ILIKE $1
            ORDER BY c.nome
            LIMIT 50
        `, [`%${q}%`])
        
        console.log(`✅ ${result.rows.length} resultados para "${q}"`)
        res.json(result.rows)
        
    } catch (error) {
        console.error("❌ Erro ao buscar cidades:", error)
        res.status(500).json({ error: "Erro ao buscar cidades" })
    }
})

// Rota pública - detectar cidade por coordenadas
router.post("/detectar", async (req, res) => {
    const { latitude, longitude } = req.body
    
    if (!latitude || !longitude) {
        return res.status(400).json({ error: "Latitude e longitude são obrigatórios" })
    }
    
    try {
        console.log(`📥 POST /api/cidades/detectar - lat: ${latitude}, lon: ${longitude}`)
        
        const result = await pool.query(`
            SELECT 
                c.codigo_ibge,
                c.nome,
                e.uf,
                c.latitude,
                c.longitude,
                c.capital,
                c.ddd,
                SQRT(
                    POW(($1 - c.latitude) * 111, 2) + 
                    POW(($2 - c.longitude) * 111 * COS(RADIANS(c.latitude)), 2)
                ) AS distancia_km
            FROM cidades c
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            ORDER BY distancia_km
            LIMIT 1
        `, [latitude, longitude])
        
        if (result.rows.length > 0) {
            console.log(`✅ Cidade mais próxima: ${result.rows[0].nome} (${result.rows[0].distancia_km.toFixed(2)} km)`)
            res.json(result.rows[0])
        } else {
            console.log("⚠️ Nenhuma cidade encontrada")
            res.status(404).json({ error: "Nenhuma cidade encontrada" })
        }
        
    } catch (error) {
        console.error("❌ Erro ao detectar cidade:", error)
        res.status(500).json({ error: "Erro ao detectar cidade" })
    }
})

// Rota protegida - criar nova cidade (apenas admin)
router.post("/", auth, async (req, res) => {
    const { 
        codigo_ibge, 
        nome, 
        latitude, 
        longitude, 
        capital, 
        codigo_uf, 
        siafi_id, 
        ddd, 
        fuso_horario 
    } = req.body
    
    if (!codigo_ibge || !nome || !codigo_uf) {
        return res.status(400).json({ 
            error: "Campos obrigatórios: codigo_ibge, nome, codigo_uf" 
        })
    }
    
    try {
        const result = await pool.query(`
            INSERT INTO cidades (
                codigo_ibge, nome, latitude, longitude, capital, 
                codigo_uf, siafi_id, ddd, fuso_horario
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (codigo_ibge) DO UPDATE SET
                nome = EXCLUDED.nome,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                capital = EXCLUDED.capital,
                ddd = EXCLUDED.ddd
            RETURNING codigo_ibge
        `, [
            codigo_ibge, nome, latitude, longitude, capital || false,
            codigo_uf, siafi_id || null, ddd, fuso_horario || 'America/Sao_Paulo'
        ])
        
        res.json({ 
            codigo_ibge: result.rows[0].codigo_ibge, 
            status: "criada/atualizada" 
        })
        
    } catch (error) {
        console.error("❌ Erro ao criar cidade:", error)
        res.status(500).json({ error: "Erro ao criar cidade" })
    }
})

// Rota para obter uma cidade específica por código IBGE
router.get("/:codigo_ibge", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.codigo_ibge,
                c.nome,
                e.uf,
                c.latitude,
                c.longitude,
                c.capital,
                c.ddd,
                e.nome as estado_nome
            FROM cidades c
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE c.codigo_ibge = $1
        `, [req.params.codigo_ibge])
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Cidade não encontrada" })
        }
        
        res.json(result.rows[0])
        
    } catch (error) {
        console.error("❌ Erro ao buscar cidade:", error)
        res.status(500).json({ error: "Erro ao buscar cidade" })
    }
})

module.exports = router

// funcionando sem filtro de estados
// const express = require("express")
// const router = express.Router()
// const pool = require("../db")
// const auth = require("../middleware/auth")

// // Rota pública - listar todas as cidades
// router.get("/", async (req, res) => {
//     try {
//         console.log("📥 GET /api/cidades - buscando cidades...")
        
//         const result = await pool.query(`
//             SELECT 
//                 c.codigo_ibge,
//                 c.nome,
//                 e.uf,
//                 c.latitude,
//                 c.longitude,
//                 c.capital,
//                 c.ddd
//             FROM cidades c
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             ORDER BY c.nome
//         `)
        
//         console.log(`✅ ${result.rows.length} cidades encontradas`)
//         res.json(result.rows)
        
//     } catch (error) {
//         console.error("❌ Erro ao listar cidades:", error)
//         res.status(500).json({ 
//             error: "Erro ao listar cidades",
//             details: error.message 
//         })
//     }
// })

// // Rota pública - buscar cidades por nome ou UF
// router.get("/buscar", async (req, res) => {
//     const { q } = req.query
    
//     if (!q || q.length < 2) {
//         return res.json([])
//     }
    
//     try {
//         console.log(`📥 GET /api/cidades/buscar?q=${q}`)
        
//         const result = await pool.query(`
//             SELECT 
//                 c.codigo_ibge,
//                 c.nome,
//                 e.uf,
//                 c.latitude,
//                 c.longitude,
//                 c.capital,
//                 c.ddd
//             FROM cidades c
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             WHERE c.nome ILIKE $1 OR e.uf ILIKE $1
//             ORDER BY c.nome
//             LIMIT 50
//         `, [`%${q}%`])
        
//         console.log(`✅ ${result.rows.length} resultados para "${q}"`)
//         res.json(result.rows)
        
//     } catch (error) {
//         console.error("❌ Erro ao buscar cidades:", error)
//         res.status(500).json({ error: "Erro ao buscar cidades" })
//     }
// })

// // Rota pública - detectar cidade por coordenadas
// router.post("/detectar", async (req, res) => {
//     const { latitude, longitude } = req.body
    
//     if (!latitude || !longitude) {
//         return res.status(400).json({ error: "Latitude e longitude são obrigatórios" })
//     }
    
//     try {
//         console.log(`📥 POST /api/cidades/detectar - lat: ${latitude}, lon: ${longitude}`)
        
//         // Calcular distância aproximada (fórmula simplificada)
//         // 1 grau ≈ 111 km
//         const result = await pool.query(`
//             SELECT 
//                 c.codigo_ibge,
//                 c.nome,
//                 e.uf,
//                 c.latitude,
//                 c.longitude,
//                 c.capital,
//                 c.ddd,
//                 SQRT(
//                     POW(($1 - c.latitude) * 111, 2) + 
//                     POW(($2 - c.longitude) * 111 * COS(RADIANS(c.latitude)), 2)
//                 ) AS distancia_km
//             FROM cidades c
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             ORDER BY distancia_km
//             LIMIT 1
//         `, [latitude, longitude])
        
//         if (result.rows.length > 0) {
//             console.log(`✅ Cidade mais próxima: ${result.rows[0].nome} (${result.rows[0].distancia_km.toFixed(2)} km)`)
//             res.json(result.rows[0])
//         } else {
//             console.log("⚠️ Nenhuma cidade encontrada")
//             res.status(404).json({ error: "Nenhuma cidade encontrada" })
//         }
        
//     } catch (error) {
//         console.error("❌ Erro ao detectar cidade:", error)
//         res.status(500).json({ error: "Erro ao detectar cidade" })
//     }
// })

// // Rota protegida - criar nova cidade (apenas admin)
// router.post("/", auth, async (req, res) => {
//     const { 
//         codigo_ibge, 
//         nome, 
//         latitude, 
//         longitude, 
//         capital, 
//         codigo_uf, 
//         siafi_id, 
//         ddd, 
//         fuso_horario 
//     } = req.body
    
//     // Validação básica
//     if (!codigo_ibge || !nome || !codigo_uf) {
//         return res.status(400).json({ 
//             error: "Campos obrigatórios: codigo_ibge, nome, codigo_uf" 
//         })
//     }
    
//     try {
//         const result = await pool.query(`
//             INSERT INTO cidades (
//                 codigo_ibge, nome, latitude, longitude, capital, 
//                 codigo_uf, siafi_id, ddd, fuso_horario
//             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
//             ON CONFLICT (codigo_ibge) DO UPDATE SET
//                 nome = EXCLUDED.nome,
//                 latitude = EXCLUDED.latitude,
//                 longitude = EXCLUDED.longitude,
//                 capital = EXCLUDED.capital,
//                 ddd = EXCLUDED.ddd
//             RETURNING codigo_ibge
//         `, [
//             codigo_ibge, nome, latitude, longitude, capital || false,
//             codigo_uf, siafi_id || null, ddd, fuso_horario || 'America/Sao_Paulo'
//         ])
        
//         res.json({ 
//             codigo_ibge: result.rows[0].codigo_ibge, 
//             status: "criada/atualizada" 
//         })
        
//     } catch (error) {
//         console.error("❌ Erro ao criar cidade:", error)
//         res.status(500).json({ error: "Erro ao criar cidade" })
//     }
// })

// // Rota para obter uma cidade específica por código IBGE
// router.get("/:codigo_ibge", async (req, res) => {
//     try {
//         const result = await pool.query(`
//             SELECT 
//                 c.codigo_ibge,
//                 c.nome,
//                 e.uf,
//                 c.latitude,
//                 c.longitude,
//                 c.capital,
//                 c.ddd,
//                 e.nome as estado_nome
//             FROM cidades c
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             WHERE c.codigo_ibge = $1
//         `, [req.params.codigo_ibge])
        
//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: "Cidade não encontrada" })
//         }
        
//         res.json(result.rows[0])
        
//     } catch (error) {
//         console.error("❌ Erro ao buscar cidade:", error)
//         res.status(500).json({ error: "Erro ao buscar cidade" })
//     }
// })

// module.exports = router

// // const express = require("express")
// // const router = express.Router()
// // const pool = require("../db")
// // const auth = require("../middleware/auth")

// // // Rota pública - listar todas as cidades ativas
// // router.get("/", async (req, res) => {
// //     try {
// //         const result = await pool.query(`
// //             SELECT id, nome, uf, latitude, longitude, raio_km 
// //             FROM cidades 
// //             WHERE ativa = true 
// //             ORDER BY nome
// //         `)
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao listar cidades:", error)
// //         res.status(500).json({ error: "Erro ao listar cidades" })
// //     }
// // })

// // // Rota pública - buscar cidades
// // router.get("/buscar", async (req, res) => {
// //     const { q } = req.query
// //     try {
// //         const result = await pool.query(`
// //             SELECT id, nome, uf, latitude, longitude, raio_km 
// //             FROM cidades 
// //             WHERE ativa = true 
// //             AND (nome ILIKE $1 OR uf ILIKE $1)
// //             ORDER BY nome
// //             LIMIT 50
// //         `, [`%${q}%`])
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao buscar cidades:", error)
// //         res.status(500).json({ error: "Erro ao buscar cidades" })
// //     }
// // })

// // // Rota pública - detectar cidade por coordenadas
// // router.post("/detectar", async (req, res) => {
// //     const { latitude, longitude } = req.body
    
// //     if (!latitude || !longitude) {
// //         return res.status(400).json({ error: "Latitude e longitude são obrigatórios" })
// //     }
    
// //     try {
// //         const result = await pool.query(`
// //             SELECT id, nome, uf, latitude, longitude, raio_km,
// //                    (6371 * acos(
// //                        cos(radians($1)) * 
// //                        cos(radians(latitude)) * 
// //                        cos(radians(longitude) - radians($2)) + 
// //                        sin(radians($1)) * 
// //                        sin(radians(latitude))
// //                    )) AS distancia_km
// //             FROM cidades 
// //             WHERE ativa = true
// //             AND (6371 * acos(
// //                 cos(radians($1)) * 
// //                 cos(radians(latitude)) * 
// //                 cos(radians(longitude) - radians($2)) + 
// //                 sin(radians($1)) * 
// //                 sin(radians(latitude))
// //             )) <= raio_km
// //             ORDER BY distancia_km
// //             LIMIT 1
// //         `, [latitude, longitude])
        
// //         if (result.rows.length > 0) {
// //             res.json(result.rows[0])
// //         } else {
// //             res.json({ error: "Nenhuma cidade encontrada na região" })
// //         }
// //     } catch (error) {
// //         console.error("Erro ao detectar cidade:", error)
// //         res.status(500).json({ error: "Erro ao detectar cidade" })
// //     }
// // })

// // // Rotas protegidas (apenas para admins) - exemplo
// // router.post("/", auth, async (req, res) => {
// //     // Aqui você pode verificar se o usuário é admin
// //     const { nome, uf, latitude, longitude, raio_km } = req.body
    
// //     try {
// //         const result = await pool.query(`
// //             INSERT INTO cidades (nome, uf, latitude, longitude, raio_km)
// //             VALUES ($1, $2, $3, $4, $5)
// //             RETURNING id
// //         `, [nome, uf, latitude, longitude, raio_km || 50])
        
// //         res.json({ id: result.rows[0].id, status: "criada" })
// //     } catch (error) {
// //         console.error("Erro ao criar cidade:", error)
// //         res.status(500).json({ error: "Erro ao criar cidade" })
// //     }
// // })

// // module.exports = router

// // // const express = require("express")
// // // const router = express.Router()
// // // const pool = require("../db")

// // // // Listar todas as cidades ativas
// // // router.get("/", async (req, res) => {
// // //     try {
// // //         const result = await pool.query(`
// // //             SELECT id, nome, uf, latitude, longitude, raio_km 
// // //             FROM cidades 
// // //             WHERE ativa = true 
// // //             ORDER BY nome
// // //         `)
// // //         res.json(result.rows)
// // //     } catch (error) {
// // //         console.error("Erro ao listar cidades:", error)
// // //         res.status(500).json({ error: "Erro ao listar cidades" })
// // //     }
// // // })

// // // // Buscar cidades por nome ou UF
// // // router.get("/buscar", async (req, res) => {
// // //     const { q } = req.query
// // //     try {
// // //         const result = await pool.query(`
// // //             SELECT id, nome, uf, latitude, longitude, raio_km 
// // //             FROM cidades 
// // //             WHERE ativa = true 
// // //             AND (nome ILIKE $1 OR uf ILIKE $1)
// // //             ORDER BY nome
// // //             LIMIT 50
// // //         `, [`%${q}%`])
// // //         res.json(result.rows)
// // //     } catch (error) {
// // //         console.error("Erro ao buscar cidades:", error)
// // //         res.status(500).json({ error: "Erro ao buscar cidades" })
// // //     }
// // // })

// // // // Obter cidade por ID
// // // router.get("/:id", async (req, res) => {
// // //     try {
// // //         const result = await pool.query(`
// // //             SELECT id, nome, uf, latitude, longitude, raio_km 
// // //             FROM cidades 
// // //             WHERE id = $1 AND ativa = true
// // //         `, [req.params.id])
        
// // //         if (result.rows.length === 0) {
// // //             return res.status(404).json({ error: "Cidade não encontrada" })
// // //         }
        
// // //         res.json(result.rows[0])
// // //     } catch (error) {
// // //         console.error("Erro ao buscar cidade:", error)
// // //         res.status(500).json({ error: "Erro ao buscar cidade" })
// // //     }
// // // })

// // // // Detectar cidade por coordenadas
// // // router.post("/detectar", async (req, res) => {
// // //     const { latitude, longitude } = req.body
    
// // //     if (!latitude || !longitude) {
// // //         return res.status(400).json({ error: "Latitude e longitude são obrigatórios" })
// // //     }
    
// // //     try {
// // //         // Busca cidades próximas baseado no raio
// // //         const result = await pool.query(`
// // //             SELECT id, nome, uf, latitude, longitude, raio_km,
// // //                    (6371 * acos(
// // //                        cos(radians($1)) * 
// // //                        cos(radians(latitude)) * 
// // //                        cos(radians(longitude) - radians($2)) + 
// // //                        sin(radians($1)) * 
// // //                        sin(radians(latitude))
// // //                    )) AS distancia_km
// // //             FROM cidades 
// // //             WHERE ativa = true
// // //             AND (6371 * acos(
// // //                 cos(radians($1)) * 
// // //                 cos(radians(latitude)) * 
// // //                 cos(radians(longitude) - radians($2)) + 
// // //                 sin(radians($1)) * 
// // //                 sin(radians(latitude))
// // //             )) <= raio_km
// // //             ORDER BY distancia_km
// // //             LIMIT 1
// // //         `, [latitude, longitude])
        
// // //         if (result.rows.length > 0) {
// // //             res.json(result.rows[0])
// // //         } else {
// // //             res.json({ error: "Nenhuma cidade encontrada na região" })
// // //         }
// // //     } catch (error) {
// // //         console.error("Erro ao detectar cidade:", error)
// // //         res.status(500).json({ error: "Erro ao detectar cidade" })
// // //     }
// // // })

// // // // Criar nova cidade (apenas admin)
// // // router.post("/", async (req, res) => {
// // //     const { nome, uf, latitude, longitude, raio_km } = req.body
    
// // //     try {
// // //         const result = await pool.query(`
// // //             INSERT INTO cidades (nome, uf, latitude, longitude, raio_km)
// // //             VALUES ($1, $2, $3, $4, $5)
// // //             RETURNING id
// // //         `, [nome, uf, latitude, longitude, raio_km || 50])
        
// // //         res.json({ id: result.rows[0].id, status: "criada" })
// // //     } catch (error) {
// // //         console.error("Erro ao criar cidade:", error)
// // //         res.status(500).json({ error: "Erro ao criar cidade" })
// // //     }
// // // })

// // // module.exports = router
