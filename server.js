require("dotenv").config()

const express = require("express")
const cors = require("cors")
const path = require("path")

const ocorrencias = require("./routes/ocorrencias")
const auth = require("./routes/auth")

const app = express()

app.use(cors())
app.use(express.json())

// pasta uploads
app.use("/uploads", express.static(path.join(__dirname,"uploads")))

// arquivos estáticos do admin
app.use(express.static(path.join(__dirname,"public")))

// rotas API
app.use("/api/ocorrencias", ocorrencias)
app.use("/api/auth", auth)


// rota inicial
app.get("/", (req,res)=>{
res.sendFile(path.join(__dirname,"public","index.html"))
})

app.listen(process.env.PORT || 3000, ()=>{
console.log("Servidor rodando")
})