const express = require("express")
const router = express.Router()
const pool = require("../db")
const jwt = require("jsonwebtoken")

router.post("/login", async (req,res)=>{
    try {
        const {email, senha} = req.body

        // Buscar usuário com informações da cidade e estado
        const user = await pool.query(`
            SELECT 
                u.*, 
                c.nome as cidade_nome, 
                c.codigo_uf,
                e.uf as estado_uf,
                e.nome as estado_nome
            FROM usuarios u
            LEFT JOIN cidades c ON u.cidade_ibge = c.codigo_ibge
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE u.email=$1 AND u.senha=$2
        `, [email, senha])

        if(user.rows.length === 0){
            return res.status(401).json({erro:"login inválido"})
        }

        const usuario = user.rows[0]

        const token = jwt.sign(
            { 
                id: usuario.id,
                email: usuario.email,
                tipo: usuario.tipo,  // ADICIONADO!
                ativo: usuario.ativo, // ADICIONADO (opcional)
                cidade_ibge: usuario.cidade_ibge,
                cidade_nome: usuario.cidade_nome,
                estado_uf: usuario.estado_uf
            },
            process.env.JWT_SECRET,
            { expiresIn:"12h"}
        )

        res.json({
            token,
            usuario: {
                id: usuario.id,
                email: usuario.email,
                tipo: usuario.tipo,  // ADICIONADO!
                ativo: usuario.ativo, // ADICIONADO (opcional)
                cidade_ibge: usuario.cidade_ibge,
                cidade_nome: usuario.cidade_nome,
                estado_uf: usuario.estado_uf
            }
        })

    } catch (error) {
        console.error("Erro no login:", error)
        res.status(500).json({erro:"erro interno no servidor"})
    }
})

module.exports = router

// const express = require("express")
// const router = express.Router()
// const pool = require("../db")
// const jwt = require("jsonwebtoken")

// router.post("/login", async (req,res)=>{
//     try {
//         const {email, senha} = req.body

//         // Buscar usuário com informações da cidade e estado
//         const user = await pool.query(`
//             SELECT 
//                 u.*, 
//                 c.nome as cidade_nome, 
//                 c.codigo_uf,
//                 e.uf as estado_uf,
//                 e.nome as estado_nome
//             FROM usuarios u
//             LEFT JOIN cidades c ON u.cidade_ibge = c.codigo_ibge
//             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
//             WHERE u.email=$1 AND u.senha=$2
//         `, [email, senha])

//         if(user.rows.length === 0){
//             return res.status(401).json({erro:"login inválido"})
//         }

//         const usuario = user.rows[0]

//         const token = jwt.sign(
//             { 
//                 id: usuario.id,
//                 email: usuario.email,
//                 cidade_ibge: usuario.cidade_ibge,
//                 cidade_nome: usuario.cidade_nome,
//                 estado_uf: usuario.estado_uf
//             },
//             process.env.JWT_SECRET,
//             { expiresIn:"12h"}
//         )

//         res.json({
//             token,
//             usuario: {
//                 id: usuario.id,
//                 email: usuario.email,
//                 cidade_ibge: usuario.cidade_ibge,
//                 cidade_nome: usuario.cidade_nome,
//                 estado_uf: usuario.estado_uf
//             }
//         })

//     } catch (error) {
//         console.error("Erro no login:", error)
//         res.status(500).json({erro:"erro interno no servidor"})
//     }
// })

// module.exports = router

// const express = require("express")
// const router = express.Router()
// const pool = require("../db")
// const jwt = require("jsonwebtoken")

// router.post("/login", async (req,res)=>{
//     try {
//         const {email, senha} = req.body

//         // Buscar usuário com informações da cidade
//         const user = await pool.query(`
//             SELECT u.*, c.nome as cidade_nome, c.uf 
//             FROM usuarios u
//             LEFT JOIN cidades c ON u.cidade_ibge = c.codigo_ibge
//             WHERE u.email=$1 AND u.senha=$2
//         `, [email, senha])

//         if(user.rows.length === 0){
//             return res.status(401).json({erro:"login inválido"})
//         }

//         const usuario = user.rows[0]

//         const token = jwt.sign(
//             { 
//                 id: usuario.id,
//                 email: usuario.email,
//                 cidade_ibge: usuario.cidade_ibge,
//                 cidade_nome: usuario.cidade_nome,
//                 cidade_uf: usuario.uf
//             },
//             process.env.JWT_SECRET,
//             { expiresIn:"12h"}
//         )

//         res.json({
//             token,
//             usuario: {
//                 id: usuario.id,
//                 email: usuario.email,
//                 cidade_ibge: usuario.cidade_ibge,
//                 cidade_nome: usuario.cidade_nome,
//                 cidade_uf: usuario.uf
//             }
//         })

//     } catch (error) {
//         console.error("Erro no login:", error)
//         res.status(500).json({erro:"erro interno no servidor"})
//     }
// })

// module.exports = router

// // const express = require("express")
// // const router = express.Router()
// // const pool = require("../db")
// // const jwt = require("jsonwebtoken")

// // router.post("/login", async (req,res)=>{
// //     try {
// //         const {email, senha} = req.body

// //         // Buscar usuário com informações da cidade
// //         const user = await pool.query(`
// //             SELECT u.*, c.nome as cidade_nome, c.uf, c.id as cidade_id
// //             FROM usuarios u
// //             LEFT JOIN cidades c ON u.cidade_id = c.id
// //             WHERE u.email=$1 AND u.senha=$2
// //         `, [email, senha])

// //         if(user.rows.length === 0){
// //             return res.status(401).json({erro:"login inválido"})
// //         }

// //         const usuario = user.rows[0]

// //         const token = jwt.sign(
// //             { 
// //                 id: usuario.id,
// //                 email: usuario.email,
// //                 cidade_id: usuario.cidade_id
// //             },
// //             process.env.JWT_SECRET,
// //             { expiresIn:"12h"}
// //         )

// //         res.json({
// //             token,
// //             usuario: {
// //                 id: usuario.id,
// //                 email: usuario.email,
// //                 cidade_id: usuario.cidade_id,
// //                 cidade_nome: usuario.cidade_nome,
// //                 cidade_uf: usuario.uf
// //             }
// //         })

// //     } catch (error) {
// //         console.error("Erro no login:", error)
// //         res.status(500).json({erro:"erro interno no servidor"})
// //     }
// // })

// // module.exports = router

// // // const express = require("express")
// // // const router = express.Router()
// // // const pool = require("../db")
// // // const jwt = require("jsonwebtoken")

// // // router.post("/login", async (req,res)=>{

// // // const {email,senha} = req.body

// // // const user = await pool.query(
// // // "SELECT * FROM usuarios WHERE email=$1 AND senha=$2",
// // // [email,senha]
// // // )

// // // if(user.rows.length === 0){
// // // return res.status(401).json({erro:"login inválido"})
// // // }

// // // const token = jwt.sign(
// // // { id:user.rows[0].id },
// // // process.env.JWT_SECRET,
// // // { expiresIn:"12h"}
// // // )

// // // res.json({token})

// // // })

// // // module.exports = router