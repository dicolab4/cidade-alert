const express = require("express")
const router = express.Router()
const pool = require("../db")
const jwt = require("jsonwebtoken")

router.post("/login", async (req,res)=>{

const {email,senha} = req.body

const user = await pool.query(
"SELECT * FROM usuarios WHERE email=$1 AND senha=$2",
[email,senha]
)

if(user.rows.length === 0){
return res.status(401).json({erro:"login inválido"})
}

const token = jwt.sign(
{ id:user.rows[0].id },
process.env.JWT_SECRET,
{ expiresIn:"12h"}
)

res.json({token})

})

module.exports = router