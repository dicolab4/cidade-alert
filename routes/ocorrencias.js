const express = require("express")
const router = express.Router()
const pool = require("../db")
const multer = require("multer")
const cloudinary = require("../config/cloudinary")
const {CloudinaryStorage} = require("multer-storage-cloudinary")
const Sightengine = require('sightengine');
const fs = require('fs');
const path = require('path');

// ===========================================
// IMPORTAR FILTRO DE PALAVRAS
// ===========================================
const profanityFilter = require('./profanity-filter');

// ===========================================
// CONFIGURAÇÃO
// ===========================================

// Configurar Sightengine
const client = new Sightengine(
  process.env.SIGHTENGINE_USER || 'SEU_USER',
  process.env.SIGHTENGINE_SECRET || 'SEU_SECRET'
);

console.log("✅ Filtro de palavras carregado com sucesso!");

// ===========================================
// CONFIGURAÇÃO DO UPLOAD (APENAS MEMÓRIA)
// ===========================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        // Aceitar apenas imagens
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas'), false);
        }
    }
});

// ===========================================
// FUNÇÕES DE MODERAÇÃO
// ===========================================

/**
 * Verifica imagem usando Sightengine
 */
async function checkImage(imageBuffer) {
    console.log("🔍 checkImage - Iniciando verificação");
    console.log("🔍 imageBuffer existe?", !!imageBuffer);
    console.log("🔍 imageBuffer tipo:", typeof imageBuffer);
    console.log("🔍 imageBuffer length:", imageBuffer?.length);
    
    if (!imageBuffer) {
        console.log("⚠️ Nenhum buffer de imagem recebido");
        return { safe: false, error: "Imagem não encontrada" };
    }
    
    try {
        // Converter buffer para base64
        const base64Image = imageBuffer.toString('base64');
        console.log("🔍 Base64 gerado, tamanho:", base64Image.length);
        
        console.log("🔍 Chamando Sightengine...");
        const result = await client.check('nudity', 'wad', 'gore')
            .setBytes(base64Image);
        
        console.log("✅ Sightengine respondeu:", JSON.stringify(result, null, 2));
        
        const isNude = result.nudity && result.nudity.raw > 0.7;
        const isViolent = result.weapon > 0.5 || result.alcohol > 0.5;
        const isGore = result.gore && result.gore.prob > 0.5;
        
        return {
            safe: !(isNude || isViolent || isGore),
            details: {
                nudity: result.nudity?.raw || 0,
                weapons: result.weapon || 0,
                alcohol: result.alcohol || 0
            }
        };
    } catch (error) {
        console.error("❌ Erro na moderação de imagem:", error.message);
        console.error("Stack:", error.stack);
        // Em caso de erro, permitir (ou bloquear dependendo da política)
        return { safe: true, details: {}, error: error.message };
    }
}

/**
 * Verifica texto ofensivo usando filtro próprio
 */
function checkText(text) {
    if (!text) return { safe: true, clean: text, profaneWords: [] };
    
    const isProfane = profanityFilter.isProfane(text);
    const cleanText = profanityFilter.clean(text);
    const profaneWords = profanityFilter.getProfaneWords(text);
    
    if (isProfane) {
        console.log("⚠️ Palavras ofensivas detectadas:", profaneWords);
    }
    
    return {
        safe: !isProfane,
        clean: cleanText,
        profaneWords: profaneWords
    };
}

/**
 * Função auxiliar para obter ID do usuário
 */
async function getUsuarioId(usuario_id, usuario_uuid) {
    if (usuario_id) {
        return parseInt(usuario_id);
    } else if (usuario_uuid) {
        const user = await pool.query(
            "SELECT id FROM usuarios WHERE uuid = $1",
            [usuario_uuid]
        );
        return user.rows.length > 0 ? user.rows[0].id : null;
    }
    return null;
}

/**
 * Função para fazer upload para o Cloudinary a partir do buffer
 */
async function uploadToCloudinary(imageBuffer, mimetype) {
    console.log("📤 Iniciando upload para Cloudinary...");
    console.log("📤 Tamanho do buffer:", imageBuffer.length);
    
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { 
                folder: "cidade-alerta",
                resource_type: "image"
            },
            (error, result) => {
                if (error) {
                    console.error("❌ Erro no upload Cloudinary:", error);
                    reject(error);
                } else {
                    console.log("✅ Upload Cloudinary concluído:", result.secure_url);
                    resolve(result);
                }
            }
        );
        
        uploadStream.end(imageBuffer);
    });
}

// ===========================================
// ROTAS
// ===========================================

// GET / - Listar ocorrências
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

// POST / - Criar ocorrência (COM MODERAÇÃO)
router.post("/", upload.single("foto"), async (req,res)=>{
    console.log("📥 Recebendo requisição POST /ocorrencias");
    console.log("📥 req.file:", req.file ? "EXISTE" : "NÃO EXISTE");
    console.log("📥 req.file fields:", req.file ? Object.keys(req.file) : "nenhum");
    console.log("📥 req.body:", req.body);
    
    try {
        const {descricao, categoria, latitude, longitude, cidade_ibge, usuario_id, usuario_uuid} = req.body
        
        // ===========================================
        // VALIDAÇÕES BÁSICAS
        // ===========================================
        if (!cidade_ibge) {
            return res.status(400).json({ error: "cidade_ibge é obrigatório" })
        }

        if (!req.file) {
            return res.status(400).json({ error: "Foto é obrigatória" })
        }

        if (!descricao || descricao.trim().length < 5) {
            return res.status(400).json({ error: "Descrição muito curta" })
        }

        // Verificar se o buffer existe
        if (!req.file.buffer) {
            console.error("❌ req.file.buffer não existe!");
            console.log("📥 req.file:", JSON.stringify(req.file, null, 2));
            return res.status(400).json({ error: "Erro ao processar imagem" });
        }

        console.log("✅ Buffer da imagem OK, tamanho:", req.file.buffer.length);

        // ===========================================
        // OBTER ID DO USUÁRIO
        // ===========================================
        const usuarioIdFinal = await getUsuarioId(usuario_id, usuario_uuid);
        console.log("👤 Usuário ID:", usuarioIdFinal);

        // ===========================================
        // MODERAÇÃO DE TEXTO
        // ===========================================
        console.log("🔍 Verificando texto...");
        const textCheck = checkText(descricao);
        
        if (!textCheck.safe) {
            console.log("🚫 Texto ofensivo detectado:", textCheck.profaneWords);
            return res.status(400).json({ 
                error: "Descrição contém palavras ofensivas",
                cleanVersion: textCheck.clean,
                profaneWords: textCheck.profaneWords
            });
        }

        // ===========================================
        // MODERAÇÃO DE IMAGEM
        // ===========================================
        console.log("🔍 Verificando imagem...");
        const imageCheck = await checkImage(req.file.buffer);
        
        if (!imageCheck.safe) {
            console.log("🚫 Imagem imprópria detectada:", imageCheck.details);
            return res.status(400).json({ 
                error: "Imagem contém conteúdo impróprio",
                details: imageCheck.details
            });
        }

        // ===========================================
        // SE TUDO OK, FAZ UPLOAD PARA CLOUDINARY
        // ===========================================
        console.log("✅ Imagem aprovada, fazendo upload...");
        
        const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype);

        // ===========================================
        // SALVAR NO BANCO
        // ===========================================
        await pool.query(
            `INSERT INTO ocorrencias
             (descricao, categoria, latitude, longitude, foto_url, cidade_ibge, usuario_id)
             VALUES($1, $2, $3, $4, $5, $6, $7)`,
            [textCheck.clean, categoria, latitude, longitude, uploadResult.secure_url, cidade_ibge, usuarioIdFinal]
        )

        console.log("✅ Ocorrência criada com sucesso:", {
            cidade: cidade_ibge,
            categoria: categoria,
            usuario_id: usuarioIdFinal
        });

        res.json({
            status: "ok", 
            message: "Ocorrência criada com sucesso",
            moderated: {
                text: true,
                image: true
            }
        })
        
    } catch (error) {
        console.error("❌ Erro ao criar ocorrência:", error);
        console.error("Stack:", error.stack);
        res.status(500).json({ error: "Erro ao criar ocorrência: " + error.message })
    }
})

// Rota por cidade
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

// Concluir ocorrência
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

// erro 500 na hora do envio
// const express = require("express")
// const router = express.Router()
// const pool = require("../db")
// const multer = require("multer")
// const cloudinary = require("../config/cloudinary")
// const {CloudinaryStorage} = require("multer-storage-cloudinary")
// const Sightengine = require('sightengine');

// // ===========================================
// // IMPORTAR FILTRO DE PALAVRAS
// // ===========================================
// const profanityFilter = require('./profanity-filter');

// // ===========================================
// // CONFIGURAÇÃO
// // ===========================================

// // Configurar Sightengine
// const client = new Sightengine(
//   process.env.SIGHTENGINE_USER || 'SEU_USER',
//   process.env.SIGHTENGINE_SECRET || 'SEU_SECRET'
// );

// console.log("✅ Filtro de palavras carregado com sucesso!");

// // ===========================================
// // CONFIGURAÇÃO DO UPLOAD
// // ===========================================
// const storage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "cidade-alerta",
//         allowed_formats: ["jpg", "jpeg", "png"]
//     }
// })

// const upload = multer({ 
//     storage,
//     limits: { fileSize: 10 * 1024 * 1024 } // 10MB
// })

// // ===========================================
// // FUNÇÕES DE MODERAÇÃO
// // ===========================================

// /**
//  * Verifica imagem usando Sightengine
//  */
// async function checkImage(imageBuffer) {
//     try {
//         const result = await client.check('nudity', 'wad', 'gore')
//             .setBytes(imageBuffer.toString('base64'));
        
//         console.log("Resultado Sightengine:", result);
        
//         const isNude = result.nudity && result.nudity.raw > 0.7;
//         const isViolent = result.weapon > 0.5 || result.alcohol > 0.5;
//         const isGore = result.gore && result.gore.prob > 0.5;
        
//         return {
//             safe: !(isNude || isViolent || isGore),
//             details: {
//                 nudity: result.nudity?.raw || 0,
//                 weapons: result.weapon || 0,
//                 alcohol: result.alcohol || 0
//             }
//         };
//     } catch (error) {
//         console.error("Erro na moderação de imagem:", error);
//         return { safe: true, details: {}, error: error.message };
//     }
// }

// /**
//  * Verifica texto ofensivo usando filtro próprio
//  */
// function checkText(text) {
//     if (!text) return { safe: true, clean: text, profaneWords: [] };
    
//     const isProfane = profanityFilter.isProfane(text);
//     const cleanText = profanityFilter.clean(text);
//     const profaneWords = profanityFilter.getProfaneWords(text);
    
//     if (isProfane) {
//         console.log("⚠️ Palavras ofensivas detectadas:", profaneWords);
//     }
    
//     return {
//         safe: !isProfane,
//         clean: cleanText,
//         profaneWords: profaneWords
//     };
// }

// /**
//  * Função auxiliar para obter ID do usuário
//  */
// async function getUsuarioId(usuario_id, usuario_uuid) {
//     if (usuario_id) {
//         return usuario_id;
//     } else if (usuario_uuid) {
//         const user = await pool.query(
//             "SELECT id FROM usuarios WHERE uuid = $1",
//             [usuario_uuid]
//         );
//         return user.rows.length > 0 ? user.rows[0].id : null;
//     }
//     return null;
// }

// // ===========================================
// // ROTAS
// // ===========================================

// // GET / - Listar ocorrências
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

// // POST / - Criar ocorrência (COM MODERAÇÃO)
// router.post("/", upload.single("foto"), async (req,res)=>{
//     try {
//         const {descricao, categoria, latitude, longitude, cidade_ibge, usuario_id, usuario_uuid} = req.body
        
//         // ===========================================
//         // VALIDAÇÕES BÁSICAS
//         // ===========================================
//         if (!cidade_ibge) {
//             return res.status(400).json({ error: "cidade_ibge é obrigatório" })
//         }

//         if (!req.file) {
//             return res.status(400).json({ error: "Foto é obrigatória" })
//         }

//         if (!descricao || descricao.trim().length < 5) {
//             return res.status(400).json({ error: "Descrição muito curta" })
//         }

//         // ===========================================
//         // OBTER ID DO USUÁRIO
//         // ===========================================
//         const usuarioIdFinal = await getUsuarioId(usuario_id, usuario_uuid);

//         // ===========================================
//         // MODERAÇÃO DE TEXTO
//         // ===========================================
//         console.log("🔍 Verificando texto...");
//         const textCheck = checkText(descricao);
        
//         if (!textCheck.safe) {
//             console.log("🚫 Texto ofensivo detectado:", textCheck.profaneWords);
//             return res.status(400).json({ 
//                 error: "Descrição contém palavras ofensivas",
//                 cleanVersion: textCheck.clean,
//                 profaneWords: textCheck.profaneWords
//             });
//         }

//         // ===========================================
//         // MODERAÇÃO DE IMAGEM
//         // ===========================================
//         console.log("🔍 Verificando imagem...");
//         const imageCheck = await checkImage(req.file.buffer);
        
//         if (!imageCheck.safe) {
//             console.log("🚫 Imagem imprópria detectada:", imageCheck.details);
//             return res.status(400).json({ 
//                 error: "Imagem contém conteúdo impróprio",
//                 details: imageCheck.details
//             });
//         }

//         // ===========================================
//         // SE TUDO OK, FAZ UPLOAD PARA CLOUDINARY
//         // ===========================================
//         console.log("✅ Imagem aprovada, fazendo upload...");
        
//         const uploadResult = await cloudinary.uploader.upload(
//             `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
//             { folder: "cidade-alerta" }
//         );

//         // ===========================================
//         // SALVAR NO BANCO
//         // ===========================================
//         await pool.query(
//             `INSERT INTO ocorrencias
//              (descricao, categoria, latitude, longitude, foto_url, cidade_ibge, usuario_id)
//              VALUES($1, $2, $3, $4, $5, $6, $7)`,
//             [textCheck.clean, categoria, latitude, longitude, uploadResult.secure_url, cidade_ibge, usuarioIdFinal]
//         )

//         console.log("✅ Ocorrência criada com sucesso:", {
//             cidade: cidade_ibge,
//             categoria: categoria,
//             usuario_id: usuarioIdFinal
//         });

//         res.json({
//             status: "ok", 
//             message: "Ocorrência criada com sucesso",
//             moderated: {
//                 text: true,
//                 image: true
//             }
//         })
        
//     } catch (error) {
//         console.error("❌ Erro ao criar ocorrência:", error)
//         res.status(500).json({ error: "Erro ao criar ocorrência" })
//     }
// })

// // Rota por cidade
// router.get("/cidade/:cidade_ibge", async (req,res)=>{
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
//         `, [req.params.cidade_ibge])
        
//         res.json(result.rows)
//     } catch (error) {
//         console.error("Erro ao listar ocorrências da cidade:", error)
//         res.status(500).json({ error: "Erro ao listar ocorrências" })
//     }
// })

// // Concluir ocorrência
// router.put("/:id/concluir", async (req,res)=>{
//     try {
//         const result = await pool.query(
//             `UPDATE ocorrencias
//             SET status='concluido', data_conclusao=NOW()
//             WHERE id=$1
//             RETURNING id`,
//             [req.params.id]
//         )
        
//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: "Ocorrência não encontrada" })
//         }
        
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
// // const Sightengine = require('sightengine');
// // const Filter = require('bad-words');

// // // ===========================================
// // // IMPORTAR PALAVRAS OFENSIVAS
// // // ===========================================
// // const profanityPT = require('./profanity-pt');

// // // ===========================================
// // // CONFIGURAÇÃO
// // // ===========================================

// // // Configurar Sightengine (gratuito por 30 dias)
// // // Cadastre-se em https://sightengine.com/ para pegar suas credenciais
// // const client = new Sightengine(
// //   process.env.SIGHTENGINE_USER || 'SEU_USER',
// //   process.env.SIGHTENGINE_SECRET || 'SEU_SECRET'
// // );

// // // Configurar filtro de palavras ofensivas
// // const filter = new Filter();

// // // Adicionar todas as palavras em português do arquivo externo
// // console.log(`📚 Carregando ${profanityPT.length} palavras ofensivas em português...`);
// // filter.addWords(...profanityPT);

// // // Opcional: remover palavras que não devem ser bloqueadas
// // // filter.removeWords('palavra_liberada');

// // console.log("✅ Filtro de palavras carregado com sucesso!");

// // // ===========================================
// // // CONFIGURAÇÃO DO UPLOAD
// // // ===========================================
// // const storage = new CloudinaryStorage({
// //     cloudinary: cloudinary,
// //     params: {
// //         folder: "cidade-alerta",
// //         allowed_formats: ["jpg", "jpeg", "png"]
// //     }
// // })

// // const upload = multer({ 
// //     storage,
// //     limits: { fileSize: 10 * 1024 * 1024 } // 10MB
// // })

// // // ===========================================
// // // FUNÇÕES DE MODERAÇÃO
// // // ===========================================

// // /**
// //  * Verifica imagem usando Sightengine
// //  */
// // async function checkImage(imageBuffer) {
// //     try {
// //         const result = await client.check('nudity', 'wad', 'gore')
// //             .setBytes(imageBuffer.toString('base64'));
        
// //         console.log("Resultado Sightengine:", result);
        
// //         // Verificar se é impróprio
// //         const isNude = result.nudity && result.nudity.raw > 0.7;
// //         const isViolent = result.weapon > 0.5 || result.alcohol > 0.5;
// //         const isGore = result.gore && result.gore.prob > 0.5;
        
// //         return {
// //             safe: !(isNude || isViolent || isGore),
// //             details: {
// //                 nudity: result.nudity?.raw || 0,
// //                 weapons: result.weapon || 0,
// //                 alcohol: result.alcohol || 0
// //             }
// //         };
// //     } catch (error) {
// //         console.error("Erro na moderação de imagem:", error);
// //         // Em caso de erro, permitir (ou bloquear dependendo da política)
// //         return { safe: true, details: {}, error: error.message };
// //     }
// // }

// // /**
// //  * Verifica texto ofensivo
// //  */
// // function checkText(text) {
// //     if (!text) return { safe: true, clean: text };
    
// //     const isProfane = filter.isProfane(text);
// //     const cleanText = filter.clean(text);
    
// //     // Listar palavras encontradas (para log)
// //     const words = text.toLowerCase().split(/\s+/);
// //     const profaneWords = words.filter(word => filter.isProfane(word));
    
// //     if (isProfane) {
// //         console.log("⚠️ Palavras ofensivas detectadas:", profaneWords);
// //     }
    
// //     return {
// //         safe: !isProfane,
// //         clean: cleanText,
// //         profaneWords: isProfane ? profaneWords : []
// //     };
// // }

// // // ===========================================
// // // ROTAS
// // // ===========================================

// // // GET / - Listar ocorrências
// // router.get("/", async (req,res)=>{
// //     try {
// //         const { cidade_ibge } = req.query
// //         let query = `
// //             SELECT o.*, 
// //                    c.nome as cidade_nome,
// //                    e.uf as estado_uf,
// //                    e.nome as estado_nome
// //             FROM ocorrencias o
// //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// //         `
// //         let params = []
        
// //         if (cidade_ibge) {
// //             query += " WHERE o.cidade_ibge = $1"
// //             params = [cidade_ibge]
// //         }
        
// //         query += " ORDER BY o.data_criacao DESC"
        
// //         const result = await pool.query(query, params)
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao listar ocorrências:", error)
// //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// //     }
// // })

// // // POST / - Criar ocorrência (COM MODERAÇÃO)
// // router.post("/", upload.single("foto"), async (req,res)=>{
// //     try {
// //         const {descricao, categoria, latitude, longitude, cidade_ibge} = req.body
        
// //         // ===========================================
// //         // VALIDAÇÕES BÁSICAS
// //         // ===========================================
// //         if (!cidade_ibge) {
// //             return res.status(400).json({ error: "cidade_ibge é obrigatório" })
// //         }

// //         if (!req.file) {
// //             return res.status(400).json({ error: "Foto é obrigatória" })
// //         }

// //         if (!descricao || descricao.trim().length < 5) {
// //             return res.status(400).json({ error: "Descrição muito curta" })
// //         }

// //         // ===========================================
// //         // MODERAÇÃO DE TEXTO
// //         // ===========================================
// //         console.log("🔍 Verificando texto...");
// //         const textCheck = checkText(descricao);
        
// //         if (!textCheck.safe) {
// //             console.log("🚫 Texto ofensivo detectado:", textCheck.profaneWords);
// //             return res.status(400).json({ 
// //                 error: "Descrição contém palavras ofensivas",
// //                 cleanVersion: textCheck.clean,
// //                 profaneWords: textCheck.profaneWords
// //             });
// //         }

// //         // ===========================================
// //         // MODERAÇÃO DE IMAGEM
// //         // ===========================================
// //         console.log("🔍 Verificando imagem...");
// //         const imageCheck = await checkImage(req.file.buffer);
        
// //         if (!imageCheck.safe) {
// //             console.log("🚫 Imagem imprópria detectada:", imageCheck.details);
// //             return res.status(400).json({ 
// //                 error: "Imagem contém conteúdo impróprio",
// //                 details: imageCheck.details
// //             });
// //         }

// //         // ===========================================
// //         // SE TUDO OK, FAZ UPLOAD PARA CLOUDINARY
// //         // ===========================================
// //         console.log("✅ Imagem aprovada, fazendo upload...");
        
// //         // Fazer upload para Cloudinary
// //         const uploadResult = await cloudinary.uploader.upload(
// //             `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
// //             { folder: "cidade-alerta" }
// //         );

// //         // Salvar no banco (usando texto limpo)
// //         await pool.query(
// //             `INSERT INTO ocorrencias
// //             (descricao, categoria, latitude, longitude, foto_url, cidade_ibge)
// //             VALUES($1, $2, $3, $4, $5, $6)`,
// //             [textCheck.clean, categoria, latitude, longitude, uploadResult.secure_url, cidade_ibge]
// //         )

// //         // Log de sucesso
// //         console.log("✅ Ocorrência criada com sucesso:", {
// //             cidade: cidade_ibge,
// //             categoria: categoria,
// //             texto_original: descricao,
// //             texto_limpo: textCheck.clean
// //         });

// //         res.json({
// //             status: "ok", 
// //             message: "Ocorrência criada com sucesso",
// //             moderated: {
// //                 text: true,
// //                 image: true
// //             }
// //         })
        
// //     } catch (error) {
// //         console.error("❌ Erro ao criar ocorrência:", error)
// //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// //     }
// // })

// // // Rota por cidade
// // router.get("/cidade/:cidade_ibge", async (req,res)=>{
// //     try {
// //         const result = await pool.query(`
// //             SELECT o.*, 
// //                    c.nome as cidade_nome,
// //                    e.uf as estado_uf,
// //                    e.nome as estado_nome
// //             FROM ocorrencias o
// //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// //             WHERE o.cidade_ibge = $1
// //             ORDER BY o.data_criacao DESC
// //         `, [req.params.cidade_ibge])
        
// //         res.json(result.rows)
// //     } catch (error) {
// //         console.error("Erro ao listar ocorrências da cidade:", error)
// //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// //     }
// // })

// // // Concluir ocorrência
// // router.put("/:id/concluir", async (req,res)=>{
// //     try {
// //         const result = await pool.query(
// //             `UPDATE ocorrencias
// //             SET status='concluido', data_conclusao=NOW()
// //             WHERE id=$1
// //             RETURNING id`,
// //             [req.params.id]
// //         )
        
// //         if (result.rows.length === 0) {
// //             return res.status(404).json({ error: "Ocorrência não encontrada" })
// //         }
        
// //         res.json({status:"concluido"})
// //     } catch (error) {
// //         console.error("Erro ao concluir ocorrência:", error)
// //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// //     }
// // })

// // module.exports = router

// // // const express = require("express")
// // // const router = express.Router()
// // // const pool = require("../db")
// // // const multer = require("multer")
// // // const cloudinary = require("../config/cloudinary")
// // // const {CloudinaryStorage} = require("multer-storage-cloudinary")
// // // const Sightengine = require('sightengine');
// // // const Filter = require('bad-words');

// // // // ===========================================
// // // // CONFIGURAÇÃO
// // // // ===========================================

// // // // Configurar Sightengine (gratuito por 30 dias)
// // // // Cadastre-se em https://sightengine.com/ para pegar suas credenciais
// // // const client = new Sightengine(
// // //   process.env.SIGHTENGINE_USER || 'SEU_USER',
// // //   process.env.SIGHTENGINE_SECRET || 'SEU_SECRET'
// // // );

// // // // Configurar filtro de palavras ofensivas
// // // const filter = new Filter();

// // // // Lista de palavras em português (adicione mais)
// // // const palavrasPT = [
// // //   'palavrao1', 'palavrao2', 'insulto1', 'insulto2',
// // //   'PUTA', 'CARALHO', 'FILHO DA PUTA'
// // // ];
// // // filter.addWords(...palavrasPT.map(p => p.toLowerCase()));

// // // // ===========================================
// // // // CONFIGURAÇÃO DO UPLOAD
// // // // ===========================================
// // // const storage = new CloudinaryStorage({
// // //     cloudinary: cloudinary,
// // //     params: {
// // //         folder: "cidade-alerta",
// // //         allowed_formats: ["jpg", "jpeg", "png"]
// // //     }
// // // })

// // // const upload = multer({ 
// // //     storage,
// // //     limits: { fileSize: 10 * 1024 * 1024 } // 10MB
// // // })

// // // // ===========================================
// // // // FUNÇÕES DE MODERAÇÃO
// // // // ===========================================

// // // /**
// // //  * Verifica imagem usando Sightengine
// // //  */
// // // async function checkImage(imageBuffer) {
// // //     try {
// // //         const result = await client.check('nudity', 'wad', 'gore')
// // //             .setBytes(imageBuffer.toString('base64'));
        
// // //         console.log("Resultado Sightengine:", result);
        
// // //         // Verificar se é impróprio
// // //         const isNude = result.nudity && result.nudity.raw > 0.7;
// // //         const isViolent = result.weapon > 0.5 || result.alcohol > 0.5;
// // //         const isGore = result.gore && result.gore.prob > 0.5;
        
// // //         return {
// // //             safe: !(isNude || isViolent || isGore),
// // //             details: {
// // //                 nudity: result.nudity?.raw || 0,
// // //                 weapons: result.weapon || 0,
// // //                 alcohol: result.alcohol || 0
// // //             }
// // //         };
// // //     } catch (error) {
// // //         console.error("Erro na moderação de imagem:", error);
// // //         // Em caso de erro, permitir (ou bloquear dependendo da política)
// // //         return { safe: true, details: {}, error: error.message };
// // //     }
// // // }

// // // /**
// // //  * Verifica texto ofensivo
// // //  */
// // // function checkText(text) {
// // //     if (!text) return { safe: true, clean: text };
    
// // //     const isProfane = filter.isProfane(text);
// // //     const cleanText = filter.clean(text);
    
// // //     return {
// // //         safe: !isProfane,
// // //         clean: cleanText
// // //     };
// // // }

// // // // ===========================================
// // // // ROTAS
// // // // ===========================================

// // // // GET / - Listar ocorrências
// // // router.get("/", async (req,res)=>{
// // //     try {
// // //         const { cidade_ibge } = req.query
// // //         let query = `
// // //             SELECT o.*, 
// // //                    c.nome as cidade_nome,
// // //                    e.uf as estado_uf,
// // //                    e.nome as estado_nome
// // //             FROM ocorrencias o
// // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // //         `
// // //         let params = []
        
// // //         if (cidade_ibge) {
// // //             query += " WHERE o.cidade_ibge = $1"
// // //             params = [cidade_ibge]
// // //         }
        
// // //         query += " ORDER BY o.data_criacao DESC"
        
// // //         const result = await pool.query(query, params)
// // //         res.json(result.rows)
// // //     } catch (error) {
// // //         console.error("Erro ao listar ocorrências:", error)
// // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // //     }
// // // })

// // // // POST / - Criar ocorrência (COM MODERAÇÃO)
// // // router.post("/", upload.single("foto"), async (req,res)=>{
// // //     try {
// // //         const {descricao, categoria, latitude, longitude, cidade_ibge} = req.body
        
// // //         // ===========================================
// // //         // VALIDAÇÕES BÁSICAS
// // //         // ===========================================
// // //         if (!cidade_ibge) {
// // //             return res.status(400).json({ error: "cidade_ibge é obrigatório" })
// // //         }

// // //         if (!req.file) {
// // //             return res.status(400).json({ error: "Foto é obrigatória" })
// // //         }

// // //         if (!descricao || descricao.trim().length < 5) {
// // //             return res.status(400).json({ error: "Descrição muito curta" })
// // //         }

// // //         // ===========================================
// // //         // MODERAÇÃO DE TEXTO
// // //         // ===========================================
// // //         const textCheck = checkText(descricao);
// // //         if (!textCheck.safe) {
// // //             console.log("🚫 Texto ofensivo detectado:", descricao);
// // //             return res.status(400).json({ 
// // //                 error: "Descrição contém palavras ofensivas",
// // //                 cleanVersion: textCheck.clean
// // //             });
// // //         }

// // //         // ===========================================
// // //         // MODERAÇÃO DE IMAGEM
// // //         // ===========================================
// // //         console.log("🔍 Verificando imagem...");
// // //         const imageCheck = await checkImage(req.file.buffer);
        
// // //         if (!imageCheck.safe) {
// // //             console.log("🚫 Imagem imprópria detectada:", imageCheck.details);
// // //             return res.status(400).json({ 
// // //                 error: "Imagem contém conteúdo impróprio",
// // //                 details: imageCheck.details
// // //             });
// // //         }

// // //         // ===========================================
// // //         // SE TUDO OK, FAZ UPLOAD PARA CLOUDINARY
// // //         // ===========================================
// // //         console.log("✅ Imagem aprovada, fazendo upload...");
        
// // //         // Fazer upload para Cloudinary
// // //         const uploadResult = await cloudinary.uploader.upload(
// // //             `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
// // //             { folder: "cidade-alerta" }
// // //         );

// // //         // Salvar no banco
// // //         await pool.query(
// // //             `INSERT INTO ocorrencias
// // //             (descricao, categoria, latitude, longitude, foto_url, cidade_ibge)
// // //             VALUES($1, $2, $3, $4, $5, $6)`,
// // //             [textCheck.clean, categoria, latitude, longitude, uploadResult.secure_url, cidade_ibge]
// // //         )

// // //         res.json({
// // //             status: "ok", 
// // //             message: "Ocorrência criada com sucesso",
// // //             moderated: {
// // //                 text: true,
// // //                 image: true
// // //             }
// // //         })
        
// // //     } catch (error) {
// // //         console.error("Erro ao criar ocorrência:", error)
// // //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// // //     }
// // // })

// // // // Rota por cidade
// // // router.get("/cidade/:cidade_ibge", async (req,res)=>{
// // //     try {
// // //         const result = await pool.query(`
// // //             SELECT o.*, 
// // //                    c.nome as cidade_nome,
// // //                    e.uf as estado_uf,
// // //                    e.nome as estado_nome
// // //             FROM ocorrencias o
// // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // //             WHERE o.cidade_ibge = $1
// // //             ORDER BY o.data_criacao DESC
// // //         `, [req.params.cidade_ibge])
        
// // //         res.json(result.rows)
// // //     } catch (error) {
// // //         console.error("Erro ao listar ocorrências da cidade:", error)
// // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // //     }
// // // })

// // // // Concluir ocorrência
// // // router.put("/:id/concluir", async (req,res)=>{
// // //     try {
// // //         const result = await pool.query(
// // //             `UPDATE ocorrencias
// // //             SET status='concluido', data_conclusao=NOW()
// // //             WHERE id=$1
// // //             RETURNING id`,
// // //             [req.params.id]
// // //         )
        
// // //         if (result.rows.length === 0) {
// // //             return res.status(404).json({ error: "Ocorrência não encontrada" })
// // //         }
        
// // //         res.json({status:"concluido"})
// // //     } catch (error) {
// // //         console.error("Erro ao concluir ocorrência:", error)
// // //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// // //     }
// // // })

// // // module.exports = router

// // // // funciona sem filtro
// // // // const express = require("express") 
// // // // const router = express.Router()
// // // // const pool = require("../db")
// // // // const multer = require("multer")
// // // // const cloudinary = require("../config/cloudinary")
// // // // const {CloudinaryStorage} = require("multer-storage-cloudinary")
// // // // // const auth = require("../middleware/auth")  // Comentado - não usado

// // // // const storage = new CloudinaryStorage({
// // // //     cloudinary: cloudinary,
// // // //     params: {
// // // //         folder: "cidade-alerta",
// // // //         allowed_formats: ["jpg", "jpeg", "png"]
// // // //     }
// // // // })

// // // // const upload = multer({storage})

// // // // // Rota pública - listar ocorrências
// // // // router.get("/", async (req,res)=>{
// // // //     try {
// // // //         const { cidade_ibge } = req.query
// // // //         let query = `
// // // //             SELECT o.*, 
// // // //                    c.nome as cidade_nome,
// // // //                    e.uf as estado_uf,
// // // //                    e.nome as estado_nome
// // // //             FROM ocorrencias o
// // // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // // //         `
// // // //         let params = []
        
// // // //         if (cidade_ibge) {
// // // //             query += " WHERE o.cidade_ibge = $1"
// // // //             params = [cidade_ibge]
// // // //         }
        
// // // //         query += " ORDER BY o.data_criacao DESC"
        
// // // //         const result = await pool.query(query, params)
// // // //         res.json(result.rows)
// // // //     } catch (error) {
// // // //         console.error("Erro ao listar ocorrências:", error)
// // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // //     }
// // // // })

// // // // // Rota pública - criar ocorrência (SEM AUTENTICAÇÃO)
// // // // router.post("/", upload.single("foto"), async (req,res)=>{
// // // //     try {
// // // //         const {descricao, categoria, latitude, longitude, cidade_ibge} = req.body
        
// // // //         // Validar cidade_ibge
// // // //         if (!cidade_ibge) {
// // // //             return res.status(400).json({ error: "cidade_ibge é obrigatório" })
// // // //         }

// // // //         // Validar foto
// // // //         if (!req.file) {
// // // //             return res.status(400).json({ error: "Foto é obrigatória" })
// // // //         }

// // // //         const foto = req.file.path

// // // //         // Inserir sem usuario_id (já que não temos autenticação)
// // // //         await pool.query(
// // // //             `INSERT INTO ocorrencias
// // // //             (descricao, categoria, latitude, longitude, foto_url, cidade_ibge)
// // // //             VALUES($1, $2, $3, $4, $5, $6)`,
// // // //             [descricao, categoria, latitude, longitude, foto, cidade_ibge]
// // // //         )

// // // //         res.json({status:"ok", message: "Ocorrência criada com sucesso"})
        
// // // //     } catch (error) {
// // // //         console.error("Erro ao criar ocorrência:", error)
// // // //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// // // //     }
// // // // })

// // // // // Rota pública - listar ocorrências por cidade
// // // // router.get("/cidade/:cidade_ibge", async (req,res)=>{
// // // //     try {
// // // //         const result = await pool.query(`
// // // //             SELECT o.*, 
// // // //                    c.nome as cidade_nome,
// // // //                    e.uf as estado_uf,
// // // //                    e.nome as estado_nome
// // // //             FROM ocorrencias o
// // // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // // //             WHERE o.cidade_ibge = $1
// // // //             ORDER BY o.data_criacao DESC
// // // //         `, [req.params.cidade_ibge])
        
// // // //         res.json(result.rows)
// // // //     } catch (error) {
// // // //         console.error("Erro ao listar ocorrências da cidade:", error)
// // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // //     }
// // // // })

// // // // // Rota pública - concluir ocorrência (se quiser manter sem auth)
// // // // router.put("/:id/concluir", async (req,res)=>{
// // // //     try {
// // // //         const result = await pool.query(
// // // //             `UPDATE ocorrencias
// // // //             SET status='concluido', data_conclusao=NOW()
// // // //             WHERE id=$1
// // // //             RETURNING id`,
// // // //             [req.params.id]
// // // //         )
        
// // // //         if (result.rows.length === 0) {
// // // //             return res.status(404).json({ error: "Ocorrência não encontrada" })
// // // //         }
        
// // // //         res.json({status:"concluido"})
// // // //     } catch (error) {
// // // //         console.error("Erro ao concluir ocorrência:", error)
// // // //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// // // //     }
// // // // })

// // // // module.exports = router

// // // // // const express = require("express")
// // // // // const router = express.Router()
// // // // // const pool = require("../db")
// // // // // const multer = require("multer")
// // // // // const cloudinary = require("../config/cloudinary")
// // // // // const {CloudinaryStorage} = require("multer-storage-cloudinary")
// // // // // const auth = require("../middleware/auth")

// // // // // const storage = new CloudinaryStorage({
// // // // //     cloudinary: cloudinary,
// // // // //     params: {
// // // // //         folder: "cidade-alerta",
// // // // //         allowed_formats: ["jpg", "jpeg", "png"]
// // // // //     }
// // // // // })

// // // // // const upload = multer({storage})

// // // // // // Rota pública - listar ocorrências (agora com filtro por código IBGE)
// // // // // router.get("/", async (req,res)=>{
// // // // //     try {
// // // // //         const { cidade_ibge } = req.query
// // // // //         let query = `
// // // // //             SELECT o.*, 
// // // // //                    c.nome as cidade_nome,
// // // // //                    e.uf as estado_uf,
// // // // //                    e.nome as estado_nome
// // // // //             FROM ocorrencias o
// // // // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // // // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // // // //         `
// // // // //         let params = []
        
// // // // //         if (cidade_ibge) {
// // // // //             query += " WHERE o.cidade_ibge = $1"
// // // // //             params = [cidade_ibge]
// // // // //         }
        
// // // // //         query += " ORDER BY o.data_criacao DESC"
        
// // // // //         const result = await pool.query(query, params)
// // // // //         res.json(result.rows)
// // // // //     } catch (error) {
// // // // //         console.error("Erro ao listar ocorrências:", error)
// // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // //     }
// // // // // })

// // // // // // Rota protegida - criar ocorrência
// // // // // //router.post("/", auth, upload.single("foto"), async (req,res)=>{
// // // // // router.post("/", upload.single("foto"), async (req,res)=>{
// // // // //     try {
// // // // //         const {descricao, categoria, latitude, longitude} = req.body
        
// // // // //         // Usar a cidade do usuário logado
// // // // //         const cidade_ibge = req.user.cidade_ibge
        
// // // // //         if (!cidade_ibge) {
// // // // //             return res.status(400).json({ error: "Usuário não está associado a nenhuma cidade" })
// // // // //         }

// // // // //         const foto = req.file.path

// // // // //         await pool.query(
// // // // //             `INSERT INTO ocorrencias
// // // // //             (descricao, categoria, latitude, longitude, foto_url, cidade_ibge, usuario_id)
// // // // //             VALUES($1, $2, $3, $4, $5, $6, $7)`,
// // // // //             [descricao, categoria, latitude, longitude, foto, cidade_ibge, req.user.id]
// // // // //         )

// // // // //         res.json({status:"ok"})
// // // // //     } catch (error) {
// // // // //         console.error("Erro ao criar ocorrência:", error)
// // // // //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// // // // //     }
// // // // // })

// // // // // // Rota protegida - listar ocorrências do usuário (da sua cidade)
// // // // // router.get("/minhas", auth, async (req,res)=>{
// // // // //     try {
// // // // //         const result = await pool.query(`
// // // // //             SELECT o.*, 
// // // // //                    c.nome as cidade_nome,
// // // // //                    e.uf as estado_uf,
// // // // //                    e.nome as estado_nome
// // // // //             FROM ocorrencias o
// // // // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // // // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // // // //             WHERE o.cidade_ibge = $1
// // // // //             ORDER BY o.data_criacao DESC
// // // // //         `, [req.user.cidade_ibge])
        
// // // // //         res.json(result.rows)
// // // // //     } catch (error) {
// // // // //         console.error("Erro ao listar ocorrências:", error)
// // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // //     }
// // // // // })

// // // // // // Rota para listar ocorrências de uma cidade específica (para dashboard)
// // // // // router.get("/cidade/:cidade_ibge", auth, async (req,res)=>{
// // // // //     try {
// // // // //         // Verificar se o usuário tem permissão para ver esta cidade
// // // // //         if (req.user.cidade_ibge != req.params.cidade_ibge) {
// // // // //             return res.status(403).json({ error: "Acesso negado a esta cidade" })
// // // // //         }
        
// // // // //         const result = await pool.query(`
// // // // //             SELECT o.*, 
// // // // //                    c.nome as cidade_nome,
// // // // //                    e.uf as estado_uf,
// // // // //                    e.nome as estado_nome,
// // // // //                    u.email as usuario_email
// // // // //             FROM ocorrencias o
// // // // //             LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
// // // // //             LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
// // // // //             LEFT JOIN usuarios u ON o.usuario_id = u.id
// // // // //             WHERE o.cidade_ibge = $1
// // // // //             ORDER BY o.data_criacao DESC
// // // // //         `, [req.params.cidade_ibge])
        
// // // // //         res.json(result.rows)
// // // // //     } catch (error) {
// // // // //         console.error("Erro ao listar ocorrências da cidade:", error)
// // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // //     }
// // // // // })

// // // // // // Rota protegida - concluir ocorrência
// // // // // router.put("/:id/concluir", auth, async (req,res)=>{
// // // // //     try {
// // // // //         // Verificar se a ocorrência pertence à cidade do usuário
// // // // //         const ocorrencia = await pool.query(
// // // // //             "SELECT cidade_ibge FROM ocorrencias WHERE id=$1",
// // // // //             [req.params.id]
// // // // //         )
        
// // // // //         if (ocorrencia.rows.length === 0) {
// // // // //             return res.status(404).json({ error: "Ocorrência não encontrada" })
// // // // //         }
        
// // // // //         if (ocorrencia.rows[0].cidade_ibge != req.user.cidade_ibge) {
// // // // //             return res.status(403).json({ error: "Acesso negado a esta ocorrência" })
// // // // //         }
        
// // // // //         await pool.query(
// // // // //             `UPDATE ocorrencias
// // // // //             SET status='concluido', data_conclusao=NOW()
// // // // //             WHERE id=$1`,
// // // // //             [req.params.id]
// // // // //         )
// // // // //         res.json({status:"concluido"})
// // // // //     } catch (error) {
// // // // //         console.error("Erro ao concluir ocorrência:", error)
// // // // //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// // // // //     }
// // // // // })

// // // // // module.exports = router

// // // // // // const express = require("express")
// // // // // // const router = express.Router()
// // // // // // const pool = require("../db")
// // // // // // const multer = require("multer")
// // // // // // const cloudinary = require("../config/cloudinary")
// // // // // // const {CloudinaryStorage} = require("multer-storage-cloudinary")
// // // // // // const auth = require("../middleware/auth") // Importar middleware

// // // // // // const storage = new CloudinaryStorage({
// // // // // //     cloudinary: cloudinary,
// // // // // //     params: {
// // // // // //         folder: "cidade-alerta",
// // // // // //         allowed_formats: ["jpg", "jpeg", "png"]
// // // // // //     }
// // // // // // })

// // // // // // const upload = multer({storage})

// // // // // // // Rota pública - listar ocorrências (pode ser sem autenticação)
// // // // // // router.get("/", async (req,res)=>{
// // // // // //     try {
// // // // // //         const { cidade_id } = req.query
// // // // // //         let query = `
// // // // // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // // // // //             FROM ocorrencias o
// // // // // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // // // // //         `
// // // // // //         let params = []
        
// // // // // //         if (cidade_id) {
// // // // // //             query += " WHERE o.cidade_id = $1"
// // // // // //             params = [cidade_id]
// // // // // //         }
        
// // // // // //         query += " ORDER BY o.data_criacao DESC"
        
// // // // // //         const result = await pool.query(query, params)
// // // // // //         res.json(result.rows)
// // // // // //     } catch (error) {
// // // // // //         console.error("Erro ao listar ocorrências:", error)
// // // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // // //     }
// // // // // // })

// // // // // // // Rota protegida - criar ocorrência (usuário precisa estar logado)
// // // // // // router.post("/", auth, upload.single("foto"), async (req,res)=>{
// // // // // //     try {
// // // // // //         const {descricao, categoria, latitude, longitude, cidade_id} = req.body
        
// // // // // //         // Se não veio cidade_id no body, usa a do usuário logado
// // // // // //         const cidadeFinal = cidade_id || req.user.cidade_id
        
// // // // // //         if (!cidadeFinal) {
// // // // // //             return res.status(400).json({ error: "cidade_id é obrigatório" })
// // // // // //         }

// // // // // //         const foto = req.file.path

// // // // // //         await pool.query(
// // // // // //             `INSERT INTO ocorrencias
// // // // // //             (descricao, categoria, latitude, longitude, foto_url, cidade_id, usuario_id)
// // // // // //             VALUES($1, $2, $3, $4, $5, $6, $7)`,
// // // // // //             [descricao, categoria, latitude, longitude, foto, cidadeFinal, req.user.id]
// // // // // //         )

// // // // // //         res.json({status:"ok"})
// // // // // //     } catch (error) {
// // // // // //         console.error("Erro ao criar ocorrência:", error)
// // // // // //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// // // // // //     }
// // // // // // })

// // // // // // // Rota protegida - listar ocorrências do usuário
// // // // // // router.get("/minhas", auth, async (req,res)=>{
// // // // // //     try {
// // // // // //         const result = await pool.query(`
// // // // // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // // // // //             FROM ocorrencias o
// // // // // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // // // // //             WHERE o.usuario_id = $1
// // // // // //             ORDER BY o.data_criacao DESC
// // // // // //         `, [req.user.id])
        
// // // // // //         res.json(result.rows)
// // // // // //     } catch (error) {
// // // // // //         console.error("Erro ao listar ocorrências do usuário:", error)
// // // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // // //     }
// // // // // // })

// // // // // // // Rota protegida - listar ocorrências por cidade (para admins/moderadores)
// // // // // // router.get("/cidade/:cidade_id", auth, async (req,res)=>{
// // // // // //     try {
// // // // // //         // Verificar se o usuário tem acesso a esta cidade
// // // // // //         if (req.user.cidade_id != req.params.cidade_id) {
// // // // // //             return res.status(403).json({ error: "Acesso negado a esta cidade" })
// // // // // //         }
        
// // // // // //         const result = await pool.query(`
// // // // // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // // // // //             FROM ocorrencias o
// // // // // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // // // // //             WHERE o.cidade_id = $1
// // // // // //             ORDER BY o.data_criacao DESC
// // // // // //         `, [req.params.cidade_id])
        
// // // // // //         res.json(result.rows)
// // // // // //     } catch (error) {
// // // // // //         console.error("Erro ao listar ocorrências da cidade:", error)
// // // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // // //     }
// // // // // // })

// // // // // // // Rota protegida - concluir ocorrência
// // // // // // router.put("/:id/concluir", auth, async (req,res)=>{
// // // // // //     try {
// // // // // //         // Verificar se a ocorrência pertence à cidade do usuário
// // // // // //         const ocorrencia = await pool.query(
// // // // // //             "SELECT cidade_id FROM ocorrencias WHERE id=$1",
// // // // // //             [req.params.id]
// // // // // //         )
        
// // // // // //         if (ocorrencia.rows.length === 0) {
// // // // // //             return res.status(404).json({ error: "Ocorrência não encontrada" })
// // // // // //         }
        
// // // // // //         if (ocorrencia.rows[0].cidade_id != req.user.cidade_id) {
// // // // // //             return res.status(403).json({ error: "Acesso negado a esta ocorrência" })
// // // // // //         }
        
// // // // // //         await pool.query(
// // // // // //             `UPDATE ocorrencias
// // // // // //             SET status='concluido', data_conclusao=NOW()
// // // // // //             WHERE id=$1`,
// // // // // //             [req.params.id]
// // // // // //         )
// // // // // //         res.json({status:"concluido"})
// // // // // //     } catch (error) {
// // // // // //         console.error("Erro ao concluir ocorrência:", error)
// // // // // //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// // // // // //     }
// // // // // // })

// // // // // // module.exports = router

// // // // // // // // Rotas para ocorrências 
// // // // // // // const express = require("express")
// // // // // // // const router = express.Router()
// // // // // // // const pool = require("../db")
// // // // // // // const multer = require("multer")
// // // // // // // const cloudinary = require("../config/cloudinary")
// // // // // // // const {CloudinaryStorage} = require("multer-storage-cloudinary")

// // // // // // // // Configuração do multer para upload de fotos para o Cloudinary
// // // // // // // const storage = new CloudinaryStorage({
// // // // // // //     cloudinary: cloudinary,
// // // // // // //     params: {
// // // // // // //         folder: "cidade-alerta",
// // // // // // //         allowed_formats: ["jpg", "jpeg", "png"]
// // // // // // //     }
// // // // // // // })

// // // // // // // const upload = multer({storage})

// // // // // // // // Criar nova ocorrência (agora com cidade_id)
// // // // // // // router.post("/", upload.single("foto"), async (req,res)=>{
// // // // // // //     try {
// // // // // // //         const {descricao, categoria, latitude, longitude, cidade_id} = req.body
        
// // // // // // //         if (!cidade_id) {
// // // // // // //             return res.status(400).json({ error: "cidade_id é obrigatório" })
// // // // // // //         }

// // // // // // //         const foto = req.file.path

// // // // // // //         await pool.query(
// // // // // // //             `INSERT INTO ocorrencias
// // // // // // //             (descricao, categoria, latitude, longitude, foto_url, cidade_id)
// // // // // // //             VALUES($1, $2, $3, $4, $5, $6)`,
// // // // // // //             [descricao, categoria, latitude, longitude, foto, cidade_id]
// // // // // // //         )

// // // // // // //         res.json({status:"ok"})
// // // // // // //     } catch (error) {
// // // // // // //         console.error("Erro ao criar ocorrência:", error)
// // // // // // //         res.status(500).json({ error: "Erro ao criar ocorrência" })
// // // // // // //     }
// // // // // // // })

// // // // // // // // Listar ocorrências (com filtro opcional por cidade)
// // // // // // // router.get("/", async (req,res)=>{
// // // // // // //     try {
// // // // // // //         const { cidade_id } = req.query
// // // // // // //         let query = `
// // // // // // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // // // // // //             FROM ocorrencias o
// // // // // // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // // // // // //         `
// // // // // // //         let params = []
        
// // // // // // //         if (cidade_id) {
// // // // // // //             query += " WHERE o.cidade_id = $1"
// // // // // // //             params = [cidade_id]
// // // // // // //         }
        
// // // // // // //         query += " ORDER BY o.data_criacao DESC"
        
// // // // // // //         const result = await pool.query(query, params)
// // // // // // //         res.json(result.rows)
// // // // // // //     } catch (error) {
// // // // // // //         console.error("Erro ao listar ocorrências:", error)
// // // // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // // // //     }
// // // // // // // })

// // // // // // // // Listar ocorrências por cidade específica
// // // // // // // router.get("/cidade/:cidade_id", async (req,res)=>{
// // // // // // //     try {
// // // // // // //         const result = await pool.query(`
// // // // // // //             SELECT o.*, c.nome as cidade_nome, c.uf 
// // // // // // //             FROM ocorrencias o
// // // // // // //             LEFT JOIN cidades c ON o.cidade_id = c.id
// // // // // // //             WHERE o.cidade_id = $1
// // // // // // //             ORDER BY o.data_criacao DESC
// // // // // // //         `, [req.params.cidade_id])
        
// // // // // // //         res.json(result.rows)
// // // // // // //     } catch (error) {
// // // // // // //         console.error("Erro ao listar ocorrências da cidade:", error)
// // // // // // //         res.status(500).json({ error: "Erro ao listar ocorrências" })
// // // // // // //     }
// // // // // // // })

// // // // // // // // Concluir ocorrência
// // // // // // // router.put("/:id/concluir", async (req,res)=>{
// // // // // // //     try {
// // // // // // //         await pool.query(
// // // // // // //             `UPDATE ocorrencias
// // // // // // //             SET status='concluido', data_conclusao=NOW()
// // // // // // //             WHERE id=$1`,
// // // // // // //             [req.params.id]
// // // // // // //         )
// // // // // // //         res.json({status:"concluido"})
// // // // // // //     } catch (error) {
// // // // // // //         console.error("Erro ao concluir ocorrência:", error)
// // // // // // //         res.status(500).json({ error: "Erro ao concluir ocorrência" })
// // // // // // //     }
// // // // // // // })

// // // // // // // module.exports = router
