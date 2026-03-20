// routes/ocorrencias.js
// ROTAS DE OCORRÊNCIAS COM MODERAÇÃO DE CONTEÚDO 
const express = require("express")
const router = express.Router()
const pool = require("../db")
const multer = require("multer")
const cloudinary = require("../config/cloudinary")
const {CloudinaryStorage} = require("multer-storage-cloudinary")
const Sightengine = require('sightengine');

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
// CONFIGURAÇÃO DO UPLOAD
// ===========================================
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "cidade-alerta",
        allowed_formats: ["jpg", "jpeg", "png"]
    }
})

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
})

// ===========================================
// FUNÇÕES DE MODERAÇÃO
// ===========================================
async function checkImage(imageBuffer) {
    if (!imageBuffer) {
        return { safe: false, error: "Imagem não encontrada" };
    }
    
    try {
        const base64Image = imageBuffer.toString('base64');
        
        // Formato correto para Sightengine
        const result = await client.check(['nudity', 'wad', 'gore'], base64Image);
        
        console.log("✅ Sightengine respondeu");
        
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
        return usuario_id;
    } else if (usuario_uuid) {
        const user = await pool.query(
            "SELECT id FROM usuarios WHERE uuid = $1",
            [usuario_uuid]
        );
        return user.rows.length > 0 ? user.rows[0].id : null;
    }
    return null;
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

        // ===========================================
        // OBTER ID DO USUÁRIO
        // ===========================================
        const usuarioIdFinal = await getUsuarioId(usuario_id, usuario_uuid);

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
        
        const uploadResult = await cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
            { folder: "cidade-alerta" }
        );

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
        console.error("❌ Erro ao criar ocorrência:", error)
        res.status(500).json({ error: "Erro ao criar ocorrência" })
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

// Concluir ocorrência - ENVIAR NOTIFICAÇÃO PARA O USUÁRIO
router.put("/:id/concluir", async (req,res)=>{
    try {
        const { id } = req.params
        
        // Buscar ocorrência com dados do usuário
        const ocorrencia = await pool.query(`
            SELECT o.*, 
                   u.fcm_token, 
                   u.id as usuario_id,
                   c.nome as cidade_nome
            FROM ocorrencias o
            LEFT JOIN usuarios u ON o.usuario_id = u.id
            LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
            WHERE o.id = $1
        `, [id])
        
        if (ocorrencia.rows.length === 0) {
            return res.status(404).json({ error: "Ocorrência não encontrada" })
        }
        
        const dados = ocorrencia.rows[0]
        
        // Atualizar status da ocorrência
        await pool.query(
            `UPDATE ocorrencias
            SET status='concluido', data_conclusao=NOW()
            WHERE id=$1`,
            [id]
        )
        
        // ===========================================
        // CRIAR MENSAGEM NO BANCO PARA O USUÁRIO
        // ===========================================
        if (dados.usuario_id) {
            const titulo = "✅ Ocorrência concluída!"
            const mensagem = `Sua denúncia de "${dados.categoria}" em ${dados.cidade_nome || 'sua cidade'} foi resolvida. Obrigado por ajudar a cidade!`
            
            await pool.query(
                `INSERT INTO mensagens (usuario_id, ocorrencia_id, titulo, mensagem)
                 VALUES ($1, $2, $3, $4)`,
                [dados.usuario_id, id, titulo, mensagem]
            )
            
            console.log(`📨 Mensagem criada para usuário ${dados.usuario_id}`)
            
            // ===========================================
            // ENVIAR NOTIFICAÇÃO PUSH (FCM)
            // ===========================================
            if (dados.fcm_token) {
                try {
                    // Verificar se o Firebase Admin está configurado
                    const admin = require('firebase-admin');
                    
                    // Verificar se já foi inicializado
                    if (!admin.apps.length) {
                        // Inicializar com as credenciais (usando variáveis de ambiente)
                        admin.initializeApp({
                            credential: admin.credential.cert({
                                projectId: process.env.FIREBASE_PROJECT_ID,
                                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                            })
                        });
                    }
                    
                    const message = {
                        notification: {
                            title: "✅ Ocorrência concluída!",
                            body: `Sua denúncia de "${dados.categoria}" foi resolvida!`
                        },
                        data: {
                            tipo: "ocorrencia_concluida",
                            ocorrencia_id: id.toString()
                        },
                        token: dados.fcm_token
                    };
                    
                    const response = await admin.messaging().send(message);
                    console.log("✅ Notificação push enviada:", response);
                    
                } catch (fcmError) {
                    console.error("❌ Erro ao enviar notificação FCM:", fcmError.message);
                    // Não falha a operação se a notificação falhar
                }
            } else {
                console.log("⚠️ Usuário não tem token FCM, notificação não enviada");
            }
        }
        
        res.json({ 
            status: "concluido",
            mensagem: "Ocorrência concluída e usuário notificado"
        })
        
    } catch (error) {
        console.error("❌ Erro ao concluir ocorrência:", error)
        res.status(500).json({ error: "Erro ao concluir ocorrência" })
    }
})

module.exports = router
