// routes/admin.js
const express = require("express")
const router = express.Router()
const pool = require("../db")
const auth = require("../middleware/auth")

// Middleware para verificar se é admin (tipo = 1)
async function isAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: "Não autenticado" })
    }
    
    try {
        const user = await pool.query(
            "SELECT tipo FROM usuarios WHERE id = $1",
            [req.user.id]
        )
        
        if (user.rows.length === 0 || user.rows[0].tipo !== 1) {
            return res.status(403).json({ error: "Acesso negado. Apenas administradores." })
        }
        
        next()
    } catch (error) {
        console.error("Erro ao verificar permissão:", error)
        res.status(500).json({ error: "Erro interno" })
    }
}

// ===========================================
// CRUD DE USUÁRIOS (APENAS ADMIN)
// ===========================================

// Listar todos os usuários
router.get("/usuarios", auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.email, u.tipo, u.ativo, u.created_at,
                   c.nome as cidade_nome, c.codigo_ibge, e.uf
            FROM usuarios u
            LEFT JOIN cidades c ON u.cidade_ibge = c.codigo_ibge
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            ORDER BY u.id
        `)
        
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao listar usuários:", error)
        res.status(500).json({ error: "Erro ao listar usuários" })
    }
})

// Criar novo usuário
router.post("/usuarios", auth, isAdmin, async (req, res) => {
    try {
        const { email, senha, tipo, cidade_ibge, ativo } = req.body
        
        if (!email || !senha) {
            return res.status(400).json({ error: "Email e senha são obrigatórios" })
        }
        
        // Verificar se email já existe
        const existente = await pool.query(
            "SELECT id FROM usuarios WHERE email = $1",
            [email]
        )
        
        if (existente.rows.length > 0) {
            return res.status(400).json({ error: "Email já cadastrado" })
        }
        
        const result = await pool.query(`
            INSERT INTO usuarios (email, senha, tipo, cidade_ibge, ativo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, tipo, ativo
        `, [
            email, 
            senha, 
            tipo || 3, 
            cidade_ibge || null, 
            ativo !== undefined ? ativo : true
        ])
        
        res.json({ 
            message: "Usuário criado com sucesso", 
            usuario: result.rows[0] 
        })
        
    } catch (error) {
        console.error("Erro ao criar usuário:", error)
        res.status(500).json({ error: "Erro ao criar usuário" })
    }
})

// Atualizar usuário
router.put("/usuarios/:id", auth, isAdmin, async (req, res) => {
    try {
        const { email, senha, tipo, cidade_ibge, ativo } = req.body
        const { id } = req.params
        
        // Construir query dinamicamente
        let updates = []
        let values = []
        let paramIndex = 1
        
        if (email) {
            updates.push(`email = $${paramIndex++}`)
            values.push(email)
        }
        if (senha) {
            updates.push(`senha = $${paramIndex++}`)
            values.push(senha)
        }
        if (tipo !== undefined) {
            updates.push(`tipo = $${paramIndex++}`)
            values.push(tipo)
        }
        if (cidade_ibge !== undefined) {
            updates.push(`cidade_ibge = $${paramIndex++}`)
            values.push(cidade_ibge)
        }
        if (ativo !== undefined) {
            updates.push(`ativo = $${paramIndex++}`)
            values.push(ativo)
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: "Nenhum campo para atualizar" })
        }
        
        values.push(id)
        const query = `
            UPDATE usuarios 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, email, tipo, ativo, cidade_ibge
        `
        
        const result = await pool.query(query, values)
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" })
        }
        
        res.json({ 
            message: "Usuário atualizado com sucesso",
            usuario: result.rows[0]
        })
        
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error)
        res.status(500).json({ error: "Erro ao atualizar usuário" })
    }
})

// Desativar/ativar usuário
router.patch("/usuarios/:id/toggle", auth, isAdmin, async (req, res) => {
    try {
        const { id } = req.params
        
        const result = await pool.query(`
            UPDATE usuarios 
            SET ativo = NOT ativo
            WHERE id = $1
            RETURNING id, email, ativo
        `, [id])
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" })
        }
        
        res.json({ 
            message: `Usuário ${result.rows[0].ativo ? 'ativado' : 'desativado'} com sucesso`,
            usuario: result.rows[0]
        })
        
    } catch (error) {
        console.error("Erro ao alternar status do usuário:", error)
        res.status(500).json({ error: "Erro ao alternar status" })
    }
})

// Buscar usuário por ID
router.get("/usuarios/:id", auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.email, u.tipo, u.ativo, u.created_at,
                   c.nome as cidade_nome, c.codigo_ibge, e.uf
            FROM usuarios u
            LEFT JOIN cidades c ON u.cidade_ibge = c.codigo_ibge
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE u.id = $1
        `, [req.params.id])
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" })
        }
        
        res.json(result.rows[0])
        
    } catch (error) {
        console.error("Erro ao buscar usuário:", error)
        res.status(500).json({ error: "Erro ao buscar usuário" })
    }
})

// Estatísticas do sistema
router.get("/estatisticas", auth, isAdmin, async (req, res) => {
    try {
        const totalUsuarios = await pool.query("SELECT COUNT(*) FROM usuarios")
        const totalOcorrencias = await pool.query("SELECT COUNT(*) FROM ocorrencias")
        const usuariosPorTipo = await pool.query(`
            SELECT 
                SUM(CASE WHEN tipo = 1 THEN 1 ELSE 0 END) as admins,
                SUM(CASE WHEN tipo = 2 THEN 1 ELSE 0 END) as moderadores,
                SUM(CASE WHEN tipo = 3 THEN 1 ELSE 0 END) as comuns
            FROM usuarios
        `)
        const ocorrenciasPorStatus = await pool.query(`
            SELECT status, COUNT(*) 
            FROM ocorrencias 
            GROUP BY status
        `)
        
        res.json({
            total_usuarios: parseInt(totalUsuarios.rows[0].count),
            total_ocorrencias: parseInt(totalOcorrencias.rows[0].count),
            usuarios_por_tipo: usuariosPorTipo.rows[0],
            ocorrencias_por_status: ocorrenciasPorStatus.rows
        })
        
    } catch (error) {
        console.error("Erro ao buscar estatísticas:", error)
        res.status(500).json({ error: "Erro ao buscar estatísticas" })
    }
})

// ===========================================
// MENSAGENS
// ===========================================

// Listar todas as mensagens
router.get("/mensagens", auth, isAdmin, async (req, res) => {
    try {
        const { lida } = req.query
        let query = `
            SELECT m.*, u.email as usuario_email
            FROM mensagens m
            LEFT JOIN usuarios u ON m.usuario_id = u.id
        `
        let params = []
        
        if (lida !== undefined) {
            query += " WHERE m.lida = $1"
            params = [lida === 'true']
        }
        
        query += " ORDER BY m.created_at DESC"
        
        const result = await pool.query(query, params)
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao listar mensagens:", error)
        res.status(500).json({ error: "Erro ao listar mensagens" })
    }
})

// ===========================================
// SQL QUERY (apenas SELECT)
// ===========================================
router.post("/sql", auth, isAdmin, async (req, res) => {
    try {
        const { query } = req.body
        
        if (!query) {
            return res.status(400).json({ error: "Query não fornecida" })
        }
        
        // Verificar se é apenas SELECT (segurança)
        const upperQuery = query.trim().toUpperCase()
        if (!upperQuery.startsWith('SELECT')) {
            return res.status(403).json({ error: "Apenas consultas SELECT são permitidas" })
        }
        
        // Bloquear comandos perigosos
        const dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE']
        for (const cmd of dangerous) {
            if (upperQuery.includes(cmd)) {
                return res.status(403).json({ error: `Comando ${cmd} não permitido` })
            }
        }
        
        const startTime = Date.now()
        const result = await pool.query(query)
        const executionTime = Date.now() - startTime
        
        res.json({
            rows: result.rows,
            rowCount: result.rowCount,
            executionTime: executionTime
        })
        
    } catch (error) {
        console.error("❌ Erro na consulta SQL:", error)
        res.status(500).json({ error: error.message })
    }
})

// Buscar mensagem por ID
router.get("/mensagens/:id", auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, u.email as usuario_email
            FROM mensagens m
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            WHERE m.id = $1
        `, [req.params.id])
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Mensagem não encontrada" })
        }
        
        res.json(result.rows[0])
    } catch (error) {
        console.error("Erro ao buscar mensagem:", error)
        res.status(500).json({ error: "Erro ao buscar mensagem" })
    }
})

// ===========================================
// OCORRÊNCIAS (para admin)
// ===========================================

// Listar ocorrências com filtros
router.get("/ocorrencias", auth, isAdmin, async (req, res) => {
    try {
        const { status, cidade } = req.query
        let query = `
            SELECT o.*, 
                   u.email as usuario_email,
                   c.nome as cidade_nome,
                   e.uf
            FROM ocorrencias o
            LEFT JOIN usuarios u ON o.usuario_id = u.id
            LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
            LEFT JOIN estados e ON c.codigo_uf = e.codigo_uf
            WHERE 1=1
        `
        let params = []
        let paramIndex = 1
        
        if (status) {
            query += ` AND o.status = $${paramIndex++}`
            params.push(status)
        }
        if (cidade) {
            query += ` AND o.cidade_ibge = $${paramIndex++}`
            params.push(cidade)
        }
        
        query += " ORDER BY o.data_criacao DESC"
        
        const result = await pool.query(query, params)
        res.json(result.rows)
    } catch (error) {
        console.error("Erro ao listar ocorrências:", error)
        res.status(500).json({ error: "Erro ao listar ocorrências" })
    }
})

// Buscar ocorrência por ID
router.get("/ocorrencias/:id", auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, u.email as usuario_email, c.nome as cidade_nome
            FROM ocorrencias o
            LEFT JOIN usuarios u ON o.usuario_id = u.id
            LEFT JOIN cidades c ON o.cidade_ibge = c.codigo_ibge
            WHERE o.id = $1
        `, [req.params.id])
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ocorrência não encontrada" })
        }
        
        res.json(result.rows[0])
    } catch (error) {
        console.error("Erro ao buscar ocorrência:", error)
        res.status(500).json({ error: "Erro ao buscar ocorrência" })
    }
})

// Concluir ocorrência (admin) - ENVIAR NOTIFICAÇÃO
router.put("/ocorrencias/:id/concluir", auth, isAdmin, async (req, res) => {
    try {
        const { id } = req.params
        
        // Buscar ocorrência com dados do usuário
        const ocorrencia = await pool.query(`
            SELECT o.*, 
                   u.fcm_token, 
                   u.id as usuario_id,
                   u.email as usuario_email,
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
        
        // Atualizar status
        await pool.query(
            `UPDATE ocorrencias
             SET status='concluido', data_conclusao=NOW()
             WHERE id=$1`,
            [id]
        )
        
        // Criar mensagem no banco
        if (dados.usuario_id) {
            const titulo = "✅ Ocorrência concluída!"
            const mensagem = `Sua denúncia de "${dados.categoria}" em ${dados.cidade_nome} foi resolvida. Obrigado por ajudar a cidade!`
            
            await pool.query(
                `INSERT INTO mensagens (usuario_id, ocorrencia_id, titulo, mensagem)
                 VALUES ($1, $2, $3, $4)`,
                [dados.usuario_id, id, titulo, mensagem]
            )
            console.log(`📨 Mensagem criada para usuário ${dados.usuario_id}`)
        }
        
        // Atualizar estatísticas
        const stats = await pool.query(`
            SELECT COUNT(*) as total_mensagens FROM mensagens
        `)
        
        res.json({ 
            status: "concluido",
            mensagem: "Ocorrência concluída e usuário notificado",
            total_mensagens: stats.rows[0].total_mensagens
        })
        
    } catch (error) {
        console.error("❌ Erro ao concluir ocorrência:", error)
        res.status(500).json({ error: "Erro ao concluir ocorrência" })
    }
})

// Atualizar estatísticas com total de mensagens
router.get("/estatisticas", auth, isAdmin, async (req, res) => {
    try {
        const totalUsuarios = await pool.query("SELECT COUNT(*) FROM usuarios")
        const totalOcorrencias = await pool.query("SELECT COUNT(*) FROM ocorrencias")
        const totalMensagens = await pool.query("SELECT COUNT(*) FROM mensagens")
        const usuariosPorTipo = await pool.query(`
            SELECT 
                SUM(CASE WHEN tipo = 1 THEN 1 ELSE 0 END) as admins,
                SUM(CASE WHEN tipo = 2 THEN 1 ELSE 0 END) as moderadores,
                SUM(CASE WHEN tipo = 3 THEN 1 ELSE 0 END) as comuns
            FROM usuarios
        `)
        const ocorrenciasPorStatus = await pool.query(`
            SELECT status, COUNT(*) 
            FROM ocorrencias 
            GROUP BY status
        `)
        
        res.json({
            total_usuarios: parseInt(totalUsuarios.rows[0].count),
            total_ocorrencias: parseInt(totalOcorrencias.rows[0].count),
            total_mensagens: parseInt(totalMensagens.rows[0].count),
            usuarios_por_tipo: usuariosPorTipo.rows[0],
            ocorrencias_por_status: ocorrenciasPorStatus.rows
        })
        
    } catch (error) {
        console.error("Erro ao buscar estatísticas:", error)
        res.status(500).json({ error: "Erro ao buscar estatísticas" })
    }
})

module.exports = router 
