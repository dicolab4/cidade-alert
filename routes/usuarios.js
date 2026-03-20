const express = require("express")
const router = express.Router()
const pool = require("../db")
const { v4: uuidv4 } = require('uuid')

// ===========================================
// FUNÇÕES AUXILIARES
// ===========================================

/**
 * Gera um UUID válido (caso o cliente não envie)
 */
function gerarUUID() {
    return uuidv4()
}

/**
 * Valida email
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
}

// ===========================================
// ROTAS PÚBLICAS (SEM AUTENTICAÇÃO)
// ===========================================

/**
 * POST /api/usuarios/anonimo
 * Cria ou atualiza usuário anônimo (UUID + FCM token)
 */
router.post("/anonimo", async (req, res) => {
    try {
        const { uuid, fcm_token } = req.body
        
        // Gerar UUID se não veio
        const usuarioUuid = uuid || gerarUUID()
        
        console.log(`👤 Criando/atualizando usuário anônimo: ${usuarioUuid}`)

        // Verificar se já existe
        let user = await pool.query(
            "SELECT id, uuid, tipo FROM usuarios WHERE uuid = $1",
            [usuarioUuid]
        )

        if (user.rows.length === 0) {
            // Criar novo usuário anônimo
            user = await pool.query(
                `INSERT INTO usuarios (uuid, fcm_token, tipo, ativo, created_at, ultimo_acesso)
                 VALUES ($1, $2, 3, true, NOW(), NOW())
                 RETURNING id, uuid, tipo`,
                [usuarioUuid, fcm_token || null]
            )
            console.log(`✅ Novo usuário anônimo criado: ID ${user.rows[0].id}`)
        } else {
            // Atualizar token FCM e último acesso
            await pool.query(
                `UPDATE usuarios 
                 SET fcm_token = COALESCE($1, fcm_token), 
                     ultimo_acesso = NOW(),
                     updated_at = NOW()
                 WHERE uuid = $2`,
                [fcm_token, usuarioUuid]
            )
            console.log(`✅ Usuário existente atualizado: ${usuarioUuid}`)
            user = { rows: [user.rows[0]] }
        }

        res.json({
            id: user.rows[0].id,
            uuid: user.rows[0].uuid,
            tipo: user.rows[0].tipo
        })

    } catch (error) {
        console.error("❌ Erro ao criar/atualizar usuário anônimo:", error)
        res.status(500).json({ error: "Erro interno ao processar usuário" })
    }
})

/**
 * POST /api/usuarios/token
 * Atualiza apenas o token FCM (mais leve)
 */
router.post("/token", async (req, res) => {
    try {
        const { usuario_id, uuid, fcm_token } = req.body

        if (!fcm_token) {
            return res.status(400).json({ error: "fcm_token é obrigatório" })
        }

        let result
        if (usuario_id) {
            result = await pool.query(
                `UPDATE usuarios 
                 SET fcm_token = $1, ultimo_acesso = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                [fcm_token, usuario_id]
            )
        } else if (uuid) {
            result = await pool.query(
                `UPDATE usuarios 
                 SET fcm_token = $1, ultimo_acesso = NOW(), updated_at = NOW()
                 WHERE uuid = $2`,
                [fcm_token, uuid]
            )
        } else {
            return res.status(400).json({ error: "usuario_id ou uuid obrigatório" })
        }

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" })
        }

        res.json({ status: "ok", message: "Token atualizado com sucesso" })

    } catch (error) {
        console.error("❌ Erro ao atualizar token:", error)
        res.status(500).json({ error: "Erro interno" })
    }
})

/**
 * POST /api/usuarios/cadastro
 * Converte usuário anônimo em usuário cadastrado (com email/senha)
 */
router.post("/cadastro", async (req, res) => {
    try {
        const { uuid, nome, email, senha, telefone } = req.body

        // Validações
        if (!uuid) {
            return res.status(400).json({ error: "uuid é obrigatório" })
        }

        if (!email || !senha) {
            return res.status(400).json({ error: "Email e senha são obrigatórios" })
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Email inválido" })
        }

        if (senha.length < 6) {
            return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres" })
        }

        // Verificar se email já está em uso
        const emailExistente = await pool.query(
            "SELECT id FROM usuarios WHERE email = $1",
            [email]
        )

        if (emailExistente.rows.length > 0) {
            return res.status(400).json({ error: "Email já cadastrado" })
        }

        // Verificar se usuário existe
        const usuarioExistente = await pool.query(
            "SELECT id, nome FROM usuarios WHERE uuid = $1",
            [uuid]
        )

        if (usuarioExistente.rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" })
        }

        // Atualizar dados
        const result = await pool.query(
            `UPDATE usuarios 
             SET nome = COALESCE($1, nome),
                 email = $2,
                 senha = $3,
                 telefone = $4,
                 updated_at = NOW()
             WHERE uuid = $5
             RETURNING id, uuid, nome, email, telefone, tipo`,
            [nome, email, senha, telefone, uuid]
        )

        console.log(`✅ Usuário ${email} cadastrado com sucesso`)

        res.json({
            id: result.rows[0].id,
            uuid: result.rows[0].uuid,
            nome: result.rows[0].nome,
            email: result.rows[0].email,
            telefone: result.rows[0].telefone,
            tipo: result.rows[0].tipo
        })

    } catch (error) {
        console.error("❌ Erro no cadastro:", error)
        res.status(500).json({ error: "Erro interno ao cadastrar usuário" })
    }
})

/**
 * POST /api/usuarios/login
 * Login com email/senha
 */
router.post("/login", async (req, res) => {
    try {
        const { email, senha, fcm_token } = req.body

        if (!email || !senha) {
            return res.status(400).json({ error: "Email e senha são obrigatórios" })
        }

        // Buscar usuário (apenas cadastrados e ativos)
        const user = await pool.query(
            `SELECT id, uuid, nome, email, telefone, tipo, ativo, fcm_token
             FROM usuarios 
             WHERE email = $1 AND senha = $2 AND ativo = true`,
            [email, senha]
        )

        if (user.rows.length === 0) {
            return res.status(401).json({ error: "Email ou senha inválidos" })
        }

        // Atualizar token FCM e último acesso
        if (fcm_token) {
            await pool.query(
                `UPDATE usuarios 
                 SET fcm_token = $1, ultimo_acesso = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                [fcm_token, user.rows[0].id]
            )
        } else {
            await pool.query(
                `UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = $1`,
                [user.rows[0].id]
            )
        }

        console.log(`✅ Login bem sucedido: ${email}`)

        res.json({
            id: user.rows[0].id,
            uuid: user.rows[0].uuid,
            nome: user.rows[0].nome,
            email: user.rows[0].email,
            telefone: user.rows[0].telefone,
            tipo: user.rows[0].tipo,
            fcm_token: user.rows[0].fcm_token
        })

    } catch (error) {
        console.error("❌ Erro no login:", error)
        res.status(500).json({ error: "Erro interno no login" })
    }
})

// ===========================================
// ROTAS DE MENSAGENS
// ===========================================

/**
 * GET /api/usuarios/:usuario_id/mensagens
 * Lista todas as mensagens de um usuário
 */
router.get("/:usuario_id/mensagens", async (req, res) => {
    try {
        const { usuario_id } = req.params
        const { apenas_nao_lidas } = req.query

        let query = `
            SELECT 
                m.*,
                o.categoria,
                o.descricao as ocorrencia_descricao,
                o.status as ocorrencia_status,
                c.nome as cidade_nome
            FROM mensagens m
            LEFT JOIN ocorrencias o ON m.ocorrencia_id = o.id
            LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
            WHERE m.usuario_id = $1
        `

        if (apenas_nao_lidas === 'true') {
            query += " AND m.lida = false"
        }

        query += " ORDER BY m.created_at DESC"

        const result = await pool.query(query, [usuario_id])

        res.json(result.rows)

    } catch (error) {
        console.error("❌ Erro ao listar mensagens:", error)
        res.status(500).json({ error: "Erro ao buscar mensagens" })
    }
})

/**
 * PUT /api/usuarios/mensagens/:id/lida
 * Marca uma mensagem como lida
 */
router.put("/mensagens/:id/lida", async (req, res) => {
    try {
        const { id } = req.params

        const result = await pool.query(
            `UPDATE mensagens 
             SET lida = true, data_leitura = NOW() 
             WHERE id = $1 AND lida = false
             RETURNING id`,
            [id]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Mensagem não encontrada ou já lida" })
        }

        res.json({ 
            status: "ok", 
            message: "Mensagem marcada como lida",
            id: result.rows[0].id
        })

    } catch (error) {
        console.error("❌ Erro ao marcar mensagem:", error)
        res.status(500).json({ error: "Erro interno" })
    }
})

/**
 * PUT /api/usuarios/mensagens/marcar-todas-lidas
 * Marca todas as mensagens de um usuário como lidas
 */
router.put("/:usuario_id/mensagens/marcar-todas-lidas", async (req, res) => {
    try {
        const { usuario_id } = req.params

        const result = await pool.query(
            `UPDATE mensagens 
             SET lida = true, data_leitura = NOW() 
             WHERE usuario_id = $1 AND lida = false
             RETURNING COUNT(*) as atualizadas`,
            [usuario_id]
        )

        res.json({ 
            status: "ok", 
            message: "Todas as mensagens marcadas como lidas",
            atualizadas: result.rowCount
        })

    } catch (error) {
        console.error("❌ Erro ao marcar mensagens:", error)
        res.status(500).json({ error: "Erro interno" })
    }
})

/**
 * GET /api/usuarios/:usuario_id/mensagens/nao-lidas
 * Retorna apenas a quantidade de mensagens não lidas
 */
router.get("/:usuario_id/mensagens/nao-lidas/contador", async (req, res) => {
    try {
        const { usuario_id } = req.params

        const result = await pool.query(
            `SELECT COUNT(*) as total 
             FROM mensagens 
             WHERE usuario_id = $1 AND lida = false`,
            [usuario_id]
        )

        res.json({ 
            total_nao_lidas: parseInt(result.rows[0].total)
        })

    } catch (error) {
        console.error("❌ Erro ao contar mensagens:", error)
        res.status(500).json({ error: "Erro interno" })
    }
})

// ===========================================
// ROTA PARA CRIAR MENSAGEM (USO INTERNO - PODE SER PROTEGIDA)
// ===========================================

/**
 * POST /api/usuarios/mensagens (interna, pode ser chamada por outras rotas)
 * Cria uma nova mensagem para um usuário
 */
async function criarMensagem(usuario_id, ocorrencia_id, titulo, mensagem) {
    try {
        const result = await pool.query(
            `INSERT INTO mensagens (usuario_id, ocorrencia_id, titulo, mensagem)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [usuario_id, ocorrencia_id, titulo, mensagem]
        )
        return result.rows[0].id
    } catch (error) {
        console.error("❌ Erro ao criar mensagem:", error)
        return null
    }
}

// Exportar a função para uso em outras rotas
module.exports.criarMensagem = criarMensagem
module.exports.router = router