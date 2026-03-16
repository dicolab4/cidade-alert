const express = require("express")
const router = express.Router()
const pool = require("../db")
const auth = require("../middleware/auth")

// Rota pública - listar todas as cidades ativas
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nome, uf, latitude, longitude, raio_km 
            FROM cidades 
            WHERE ativa = true 
            ORDER BY nome
        `)
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao listar cidades:", error)
        res.status(500).json({ error: "Erro ao listar cidades" })
    }
})

// Rota pública - buscar cidades
router.get("/buscar", async (req, res) => {
    const { q } = req.query
    try {
        const result = await pool.query(`
            SELECT id, nome, uf, latitude, longitude, raio_km 
            FROM cidades 
            WHERE ativa = true 
            AND (nome ILIKE $1 OR uf ILIKE $1)
            ORDER BY nome
            LIMIT 50
        `, [`%${q}%`])
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao buscar cidades:", error)
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
        const result = await pool.query(`
            SELECT id, nome, uf, latitude, longitude, raio_km,
                   (6371 * acos(
                       cos(radians($1)) * 
                       cos(radians(latitude)) * 
                       cos(radians(longitude) - radians($2)) + 
                       sin(radians($1)) * 
                       sin(radians(latitude))
                   )) AS distancia_km
            FROM cidades 
            WHERE ativa = true
            AND (6371 * acos(
                cos(radians($1)) * 
                cos(radians(latitude)) * 
                cos(radians(longitude) - radians($2)) + 
                sin(radians($1)) * 
                sin(radians(latitude))
            )) <= raio_km
            ORDER BY distancia_km
            LIMIT 1
        `, [latitude, longitude])
        
        if (result.rows.length > 0) {
            res.json(result.rows[0])
        } else {
            res.json({ error: "Nenhuma cidade encontrada na região" })
        }
    } catch (error) {
        console.error("Erro ao detectar cidade:", error)
        res.status(500).json({ error: "Erro ao detectar cidade" })
    }
})

// Rotas protegidas (apenas para admins) - exemplo
router.post("/", auth, async (req, res) => {
    // Aqui você pode verificar se o usuário é admin
    const { nome, uf, latitude, longitude, raio_km } = req.body
    
    try {
        const result = await pool.query(`
            INSERT INTO cidades (nome, uf, latitude, longitude, raio_km)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [nome, uf, latitude, longitude, raio_km || 50])
        
        res.json({ id: result.rows[0].id, status: "criada" })
    } catch (error) {
        console.error("Erro ao criar cidade:", error)
        res.status(500).json({ error: "Erro ao criar cidade" })
    }
})

module.exports = router

// const express = require("express")
// const router = express.Router()
// const pool = require("../db")

// // Listar todas as cidades ativas
// router.get("/", async (req, res) => {
//     try {
//         const result = await pool.query(`
//             SELECT id, nome, uf, latitude, longitude, raio_km 
//             FROM cidades 
//             WHERE ativa = true 
//             ORDER BY nome
//         `)
//         res.json(result.rows)
//     } catch (error) {
//         console.error("Erro ao listar cidades:", error)
//         res.status(500).json({ error: "Erro ao listar cidades" })
//     }
// })

// // Buscar cidades por nome ou UF
// router.get("/buscar", async (req, res) => {
//     const { q } = req.query
//     try {
//         const result = await pool.query(`
//             SELECT id, nome, uf, latitude, longitude, raio_km 
//             FROM cidades 
//             WHERE ativa = true 
//             AND (nome ILIKE $1 OR uf ILIKE $1)
//             ORDER BY nome
//             LIMIT 50
//         `, [`%${q}%`])
//         res.json(result.rows)
//     } catch (error) {
//         console.error("Erro ao buscar cidades:", error)
//         res.status(500).json({ error: "Erro ao buscar cidades" })
//     }
// })

// // Obter cidade por ID
// router.get("/:id", async (req, res) => {
//     try {
//         const result = await pool.query(`
//             SELECT id, nome, uf, latitude, longitude, raio_km 
//             FROM cidades 
//             WHERE id = $1 AND ativa = true
//         `, [req.params.id])
        
//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: "Cidade não encontrada" })
//         }
        
//         res.json(result.rows[0])
//     } catch (error) {
//         console.error("Erro ao buscar cidade:", error)
//         res.status(500).json({ error: "Erro ao buscar cidade" })
//     }
// })

// // Detectar cidade por coordenadas
// router.post("/detectar", async (req, res) => {
//     const { latitude, longitude } = req.body
    
//     if (!latitude || !longitude) {
//         return res.status(400).json({ error: "Latitude e longitude são obrigatórios" })
//     }
    
//     try {
//         // Busca cidades próximas baseado no raio
//         const result = await pool.query(`
//             SELECT id, nome, uf, latitude, longitude, raio_km,
//                    (6371 * acos(
//                        cos(radians($1)) * 
//                        cos(radians(latitude)) * 
//                        cos(radians(longitude) - radians($2)) + 
//                        sin(radians($1)) * 
//                        sin(radians(latitude))
//                    )) AS distancia_km
//             FROM cidades 
//             WHERE ativa = true
//             AND (6371 * acos(
//                 cos(radians($1)) * 
//                 cos(radians(latitude)) * 
//                 cos(radians(longitude) - radians($2)) + 
//                 sin(radians($1)) * 
//                 sin(radians(latitude))
//             )) <= raio_km
//             ORDER BY distancia_km
//             LIMIT 1
//         `, [latitude, longitude])
        
//         if (result.rows.length > 0) {
//             res.json(result.rows[0])
//         } else {
//             res.json({ error: "Nenhuma cidade encontrada na região" })
//         }
//     } catch (error) {
//         console.error("Erro ao detectar cidade:", error)
//         res.status(500).json({ error: "Erro ao detectar cidade" })
//     }
// })

// // Criar nova cidade (apenas admin)
// router.post("/", async (req, res) => {
//     const { nome, uf, latitude, longitude, raio_km } = req.body
    
//     try {
//         const result = await pool.query(`
//             INSERT INTO cidades (nome, uf, latitude, longitude, raio_km)
//             VALUES ($1, $2, $3, $4, $5)
//             RETURNING id
//         `, [nome, uf, latitude, longitude, raio_km || 50])
        
//         res.json({ id: result.rows[0].id, status: "criada" })
//     } catch (error) {
//         console.error("Erro ao criar cidade:", error)
//         res.status(500).json({ error: "Erro ao criar cidade" })
//     }
// })

// module.exports = router