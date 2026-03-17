const express = require("express")
const router = express.Router()
const pool = require("../db")
const multer = require("multer")
const cloudinary = require("../config/cloudinary")
const {CloudinaryStorage} = require("multer-storage-cloudinary")
// const auth = require("../middleware/auth")  // Comentado - não usado

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "cidade-alerta",
        allowed_formats: ["jpg", "jpeg", "png"]
    }
})

const upload = multer({storage})

// Rota pública - listar ocorrências
router.get("/", async (req,res)=>{
    try {
        const { cidade_ibge } = req.query
        let query = `
            SELECT o.*, 
                   c.nome as cidade_nome,
                   e.uf as estado_uf,
                   e.nome as estado_nome
            FROM ocorrencias o
            LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
        `
        let params = []
        
        if (cidade_ibge) {
            query += " WHERE o.cidade_ibge = $1"
            params = [cidade_ibge]
        }
        
        query += " ORDER BY o.data_criacao DESC"
        
        const result = await pool.query(query, params)
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao listar ocorrências:", error)
        res.status(500).json({ error: "Erro ao listar ocorrências" })
    }
})

// Rota pública - criar ocorrência (SEM AUTENTICAÇÃO)
router.post("/", upload.single("foto"), async (req,res)=>{
    try {
        const {descricao, categoria, latitude, longitude, cidade_ibge} = req.body
        
        // Validar cidade_ibge
        if (!cidade_ibge) {
            return res.status(400).json({ error: "cidade_ibge é obrigatório" })
        }

        // Validar foto
        if (!req.file) {
            return res.status(400).json({ error: "Foto é obrigatória" })
        }

        const foto = req.file.path

        // Inserir sem usuario_id (já que não temos autenticação)
        await pool.query(
            `INSERT INTO ocorrencias
            (descricao, categoria, latitude, longitude, foto_url, cidade_ibge)
            VALUES($1, $2, $3, $4, $5, $6)`,
            [descricao, categoria, latitude, longitude, foto, cidade_ibge]
        )

        res.json({status:"ok", message: "Ocorrência criada com sucesso"})
        
    } catch (error) {
        console.error("Erro ao criar ocorrência:", error)
        res.status(500).json({ error: "Erro ao criar ocorrência" })
    }
})

// Rota pública - listar ocorrências por cidade
router.get("/cidade/:cidade_ibge", async (req,res)=>{
    try {
        const result = await pool.query(`
            SELECT o.*, 
                   c.nome as cidade_nome,
                   e.uf as estado_uf,
                   e.nome as estado_nome
            FROM ocorrencias o
            LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE o.cidade_ibge = $1
            ORDER BY o.data_criacao DESC
        `, [req.params.cidade_ibge])
        
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao listar ocorrências da cidade:", error)
        res.status(500).json({ error: "Erro ao listar ocorrências" })
    }
})

// Rota pública - concluir ocorrência (se quiser manter sem auth)
router.put("/:id/concluir", async (req,res)=>{
    try {
        const result = await pool.query(
            `UPDATE ocorrencias
            SET status='concluido', data_conclusao=NOW()
            WHERE id=$1
            RETURNING id`,
            [req.params.id]
        )
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ocorrência não encontrada" })
        }
        
        res.json({status:"concluido"})
    } catch (error) {
        console.error("Erro ao concluir ocorrência:", error)
        res.status(500).json({ error: "Erro ao concluir ocorrência" })
    }
})

module.exports = router

// const express = require("express")
// const router = express.Router()
// const pool = require("../db")
// const multer = require("multer")
// const cloudinary = require("../config/cloudinary")
// const {CloudinaryStorage} = require("multer-storage-cloudinary")
// const auth = require("../middleware/auth")

// const storage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "cidade-alerta",
//         allowed_formats: ["jpg", "jpeg", "png"]
//     }
// })

// const upload = multer({storage})

// // Rota pública - listar ocorrências (agora com filtro por código IBGE)
// router.get("/", async (req,res)=>{
//     try {
//         const { cidade_ibge } = req.query
//         let query = `
//             SELECT o.*, 
//                    c.nome as cidade_nome,
//                    e.uf as estado_uf,
//                    e.nome as estado_nome
//             FROM ocorrencias o
//             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//         `
//         let params = []
        
//         if (cidade_ibge) {
//             query += " WHERE o.cidade_ibge = $1"
//             params = [cidade_ibge]
//         }
        
//         query += " ORDER BY o.data_criacao DESC"
        
//         const result = await pool.query(query, params)
//         res.json(result.rows)
//     } catch (error) {
//         console.error("Erro ao listar ocorrências:", error)
//         res.status(500).json({ error: "Erro ao listar ocorrências" })
//     }
// })

// // Rota protegida - criar ocorrência
// router.post("/", upload.single("foto"), async (req,res)=>{
//     try {
//         const {descricao, categoria, latitude, longitude} = req.body
        
//         // Usar a cidade do usuário logado
//         const cidade_ibge = req.user.cidade_ibge
        
//         if (!cidade_ibge) {
//             return res.status(400).json({ error: "Usuário não está associado a nenhuma cidade" })
//         }

//         const foto = req.file.path

//         await pool.query(
//             `INSERT INTO ocorrencias
//             (descricao, categoria, latitude, longitude, foto_url, cidade_ibge, usuario_id)
//             VALUES($1, $2, $3, $4, $5, $6, $7)`,
//             [descricao, categoria, latitude, longitude, foto, cidade_ibge, req.user.id]
//         )

//         res.json({status:"ok"})
//     } catch (error) {
//         console.error("Erro ao criar ocorrência:", error)
//         res.status(500).json({ error: "Erro ao criar ocorrência" })
//     }
// })

// // Rota protegida - listar ocorrências do usuário (da sua cidade)
// router.get("/minhas", auth, async (req,res)=>{
//     try {
//         const result = await pool.query(`
//             SELECT o.*, 
//                    c.nome as cidade_nome,
//                    e.uf as estado_uf,
//                    e.nome as estado_nome
//             FROM ocorrencias o
//             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             WHERE o.cidade_ibge = $1
//             ORDER BY o.data_criacao DESC
//         `, [req.user.cidade_ibge])
        
//         res.json(result.rows)
//     } catch (error) {
//         console.error("Erro ao listar ocorrências:", error)
//         res.status(500).json({ error: "Erro ao listar ocorrências" })
//     }
// })

// // Rota para listar ocorrências de uma cidade específica (para dashboard)
// router.get("/cidade/:cidade_ibge", auth, async (req,res)=>{
//     try {
//         // Verificar se o usuário tem permissão para ver esta cidade
//         if (req.user.cidade_ibge != req.params.cidade_ibge) {
//             return res.status(403).json({ error: "Acesso negado a esta cidade" })
//         }
        
//         const result = await pool.query(`
//             SELECT o.*, 
//                    c.nome as cidade_nome,
//                    e.uf as estado_uf,
//                    e.nome as estado_nome,
//                    u.email as usuario_email
//             FROM ocorrencias o
//             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             LEFT JOIN usuarios u ON o.usuario_id = u.id
//             WHERE o.cidade_ibge = $1
//             ORDER BY o.data_criacao DESC
//         `, [req.params.cidade_ibge])
        
//         res.json(result.rows)
//     } catch (error) {
//         console.error("Erro ao listar ocorrências da cidade:", error)
//         res.status(500).json({ error: "Erro ao listar ocorrências" })
//     }
// })

// // Rota protegida - concluir ocorrência
// router.put("/:id/concluir", auth, async (req,res)=>{
//     try {
//         // Verificar se a ocorrência pertence à cidade do usuário
//         const ocorrencia = await pool.query(
//             "SELECT cidade_ibge FROM ocorrencias WHERE id=$1",
//             [req.params.id]
//         )
        
//         if (ocorrencia.rows.length === 0) {
//             return res.status(404).json({ error: "Ocorrência não encontrada" })
//         }
        
//         if (ocorrencia.rows[0].cidade_ibge != req.user.cidade_ibge) {
//             return res.status(403).json({ error: "Acesso negado a esta ocorrência" })
//         }
        
//         await pool.query(
//             `UPDATE ocorrencias
//             SET status='concluido', data_conclusao=NOW()
//             WHERE id=$1`,
//             [req.params.id]
//         )
//         res.json({status:"concluido"})
//     } catch (error) {
//         console.error("Erro ao concluir ocorrência:", error)
//         res.status(500).json({ error: "Erro ao concluir ocorrência" })
//     }
// })

// module.exports = router

// // const express = require("express")
// // const router = express.Router()
// // const pool = require("../db")
// // const multer = require("multer")
// // const cloudinary = require("../config/cloudinary")
// // const {CloudinaryStorage} = require("multer-storage-cloudinary")
// // const auth = require("../middleware/auth") // Importar middleware

// // const storage = new CloudinaryStorage({
// //     cloudinary: cloudinary,
// //     params: {
// //         folder: "cidade-alerta",
// //         allowed_formats: ["jpg", "jpeg", "png"]
// //     }
// // })

// // const upload = multer({storage})

// // // Rota pública - listar ocorrências (pode ser sem autenticação)
// // router.get("/", async (req,res)=>{
// //     try {
// //         const { cidade_id } = req.query
// //         let query = `
// //             SELECT o.*, c.nome as cidade_nome, c.uf 
// //             FROM ocorrencias o
// //             LEFT JOIN cidades c ON o.cidade_id = c.id
// //         `
// //         let params = []
        
// //         if (cidade_id) {
// //             query += " WHERE o.cidade_id = $1"
// //             params = [cidade_id]
// //         }
        
// //         query += " ORDER BY o.data_criacao DESC"
        
// //         const result = await pool.query(query, params)
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao listar ocorrências:", error)
// //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// //     }
// // })

// // // Rota protegida - criar ocorrência (usuário precisa estar logado)
// // router.post("/", auth, upload.single("foto"), async (req,res)=>{
// //     try {
// //         const {descricao, categoria, latitude, longitude, cidade_id} = req.body
        
// //         // Se não veio cidade_id no body, usa a do usuário logado
// //         const cidadeFinal = cidade_id || req.user.cidade_id
        
// //         if (!cidadeFinal) {
// //             return res.status(400).json({ error: "cidade_id é obrigatório" })
// //         }

// //         const foto = req.file.path

// //         await pool.query(
// //             `INSERT INTO ocorrencias
// //             (descricao, categoria, latitude, longitude, foto_url, cidade_id, usuario_id)
// //             VALUES($1, $2, $3, $4, $5, $6, $7)`,
// //             [descricao, categoria, latitude, longitude, foto, cidadeFinal, req.user.id]
// //         )

// //         res.json({status:"ok"})
// //     } catch (error) {
// //         console.error("Erro ao criar ocorrência:", error)
// //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// //     }
// // })

// // // Rota protegida - listar ocorrências do usuário
// // router.get("/minhas", auth, async (req,res)=>{
// //     try {
// //         const result = await pool.query(`
// //             SELECT o.*, c.nome as cidade_nome, c.uf 
// //             FROM ocorrencias o
// //             LEFT JOIN cidades c ON o.cidade_id = c.id
// //             WHERE o.usuario_id = $1
// //             ORDER BY o.data_criacao DESC
// //         `, [req.user.id])
        
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao listar ocorrências do usuário:", error)
// //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// //     }
// // })

// // // Rota protegida - listar ocorrências por cidade (para admins/moderadores)
// // router.get("/cidade/:cidade_id", auth, async (req,res)=>{
// //     try {
// //         // Verificar se o usuário tem acesso a esta cidade
// //         if (req.user.cidade_id != req.params.cidade_id) {
// //             return res.status(403).json({ error: "Acesso negado a esta cidade" })
// //         }
        
// //         const result = await pool.query(`
// //             SELECT o.*, c.nome as cidade_nome, c.uf 
// //             FROM ocorrencias o
// //             LEFT JOIN cidades c ON o.cidade_id = c.id
// //             WHERE o.cidade_id = $1
// //             ORDER BY o.data_criacao DESC
// //         `, [req.params.cidade_id])
        
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao listar ocorrências da cidade:", error)
// //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// //     }
// // })

// // // Rota protegida - concluir ocorrência
// // router.put("/:id/concluir", auth, async (req,res)=>{
// //     try {
// //         // Verificar se a ocorrência pertence à cidade do usuário
// //         const ocorrencia = await pool.query(
// //             "SELECT cidade_id FROM ocorrencias WHERE id=$1",
// //             [req.params.id]
// //         )
        
// //         if (ocorrencia.rows.length === 0) {
// //             return res.status(404).json({ error: "Ocorrência não encontrada" })
// //         }
        
// //         if (ocorrencia.rows[0].cidade_id != req.user.cidade_id) {
// //             return res.status(403).json({ error: "Acesso negado a esta ocorrência" })
// //         }
        
// //         await pool.query(
// //             `UPDATE ocorrencias
// //             SET status='concluido', data_conclusao=NOW()
// //             WHERE id=$1`,
// //             [req.params.id]
// //         )
// //         res.json({status:"concluido"})
// //     } catch (error) {
// //         console.error("Erro ao concluir ocorrência:", error)
// //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// //     }
// // })

// // module.exports = router

// // // // Rotas para ocorrências 
// // // const express = require("express")
// // // const router = express.Router()
// // // const pool = require("../db")
// // // const multer = require("multer")
// // // const cloudinary = require("../config/cloudinary")
// // // const {CloudinaryStorage} = require("multer-storage-cloudinary")

// // // // Configuração do multer para upload de fotos para o Cloudinary
// // // const storage = new CloudinaryStorage({
// // //     cloudinary: cloudinary,
// // //     params: {
// // //         folder: "cidade-alerta",
// // //         allowed_formats: ["jpg", "jpeg", "png"]
// // //     }
// // // })

// // // const upload = multer({storage})

// // // // Criar nova ocorrência (agora com cidade_id)
// // // router.post("/", upload.single("foto"), async (req,res)=>{
// // //     try {
// // //         const {descricao, categoria, latitude, longitude, cidade_id} = req.body
        
// // //         if (!cidade_id) {
// // //             return res.status(400).json({ error: "cidade_id é obrigatório" })
// // //         }

// // //         const foto = req.file.path

// // //         await pool.query(
// // //             `INSERT INTO ocorrencias
// // //             (descricao, categoria, latitude, longitude, foto_url, cidade_id)
// // //             VALUES($1, $2, $3, $4, $5, $6)`,
// // //             [descricao, categoria, latitude, longitude, foto, cidade_id]
// // //         )

// // //         res.json({status:"ok"})
// // //     } catch (error) {
// // //         console.error("Erro ao criar ocorrência:", error)
// // //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// // //     }
// // // })

// // // // Listar ocorrências (com filtro opcional por cidade)
// // // router.get("/", async (req,res)=>{
// // //     try {
// // //         const { cidade_id } = req.query
// // //         let query = `
// // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // //             FROM ocorrencias o
// // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // //         `
// // //         let params = []
        
// // //         if (cidade_id) {
// // //             query += " WHERE o.cidade_id = $1"
// // //             params = [cidade_id]
// // //         }
        
// // //         query += " ORDER BY o.data_criacao DESC"
        
// // //         const result = await pool.query(query, params)
// // //         res.json(result.rows)
// // //     } catch (error) {
// // //         console.error("Erro ao listar ocorrências:", error)
// // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // //     }
// // // })

// // // // Listar ocorrências por cidade específica
// // // router.get("/cidade/:cidade_id", async (req,res)=>{
// // //     try {
// // //         const result = await pool.query(`
// // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // //             FROM ocorrencias o
// // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // //             WHERE o.cidade_id = $1
// // //             ORDER BY o.data_criacao DESC
// // //         `, [req.params.cidade_id])
        
// // //         res.json(result.rows)
// // //     } catch (error) {
// // //         console.error("Erro ao listar ocorrências da cidade:", error)
// // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // //     }
// // // })

// // // // Concluir ocorrência
// // // router.put("/:id/concluir", async (req,res)=>{
// // //     try {
// // //         await pool.query(
// // //             `UPDATE ocorrencias
// // //             SET status='concluido', data_conclusao=NOW()
// // //             WHERE id=$1`,
// // //             [req.params.id]
// // //         )
// // //         res.json({status:"concluido"})
// // //     } catch (error) {
// // //         console.error("Erro ao concluir ocorrência:", error)
// // //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// // //     }
// // // })

// // // module.exports = router
