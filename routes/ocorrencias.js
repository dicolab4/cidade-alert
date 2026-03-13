const express = require("express")
const router = express.Router()
const pool = require("../db")
const multer = require("multer")

const storage = multer.diskStorage({

destination:"uploads/",

filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname)
}

})

const upload = multer({storage})

router.post("/", upload.single("foto"), async (req,res)=>{

const {descricao,categoria,latitude,longitude} = req.body

const foto = req.file.filename

await pool.query(
`INSERT INTO ocorrencias
(descricao,categoria,latitude,longitude,foto_url)
VALUES($1,$2,$3,$4,$5)`,
[descricao,categoria,latitude,longitude,foto]
)

res.json({status:"ok"})

})

router.get("/", async (req,res)=>{

const result = await pool.query(
"SELECT * FROM ocorrencias ORDER BY data_criacao DESC"
)

res.json(result.rows)

})

router.put("/:id/concluir", async (req,res)=>{

await pool.query(
`UPDATE ocorrencias
SET status='concluido', data_conclusao=NOW()
WHERE id=$1`,
[req.params.id]
)

res.json({status:"concluido"})

})

module.exports = router