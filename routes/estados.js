const express = require("express")
const router = express.Router()
const pool = require("../db")

// Rota pública - listar todos os estados
router.get("/", async (req, res) => {
    try {
        console.log("📥 GET /api/estados - buscando estados...")
        
        const result = await pool.query(`
            SELECT 
                codigo_uf,
                uf,
                nome
            FROM estados 
            ORDER BY uf
        `)
        
        console.log(`✅ ${result.rows.length} estados encontrados`)
        res.json(result.rows)
        
    } catch (error) {
        console.error("❌ Erro ao listar estados:", error)
        res.status(500).json({ error: "Erro ao listar estados" })
    }
})

// Rota pública - buscar estado por UF
router.get("/:uf", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                codigo_uf,
                uf,
                nome
            FROM estados 
            WHERE uf = $1
        `, [req.params.uf.toUpperCase()])
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Estado não encontrado" })
        }
        
        res.json(result.rows[0])
        
    } catch (error) {
        console.error("❌ Erro ao buscar estado:", error)
        res.status(500).json({ error: "Erro ao buscar estado" })
    }
})

module.exports = router
