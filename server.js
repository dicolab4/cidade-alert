require("dotenv").config() 

const express = require("express")
const cors = require("cors")
const path = require("path")

const ocorrencias = require("./routes/ocorrencias")
const auth = require("./routes/auth")
const cidades = require("./routes/cidades") // NOVA ROTA
const migrate = require("./migrate")

const app = express()

app.use(cors())
app.use(express.json())

app.use("/uploads", express.static(path.join(__dirname,"uploads")))
app.use(express.static(path.join(__dirname,"public")))

// Rotas da API
app.use("/api/ocorrencias", ocorrencias)
app.use("/api/auth", auth)
app.use("/api/cidades", cidades) // NOVA ROTA

// Rotas do frontend
app.get("/", (req,res)=>{
    res.sendFile(path.join(__dirname,"public","index.html"))
})

app.get("/login",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","login.html"))
})

app.get("/dashboard",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","dashboard.html"))
})

app.get("/nova-ocorrencia",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","nova-ocorrencia.html"))
})

app.get("/mapa",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","mapa.html"))
})

async function start(){
    await migrate()
    app.listen(process.env.PORT || 3000, ()=>{
        console.log("🚀 Servidor rodando na porta", process.env.PORT || 3000)
    })
}

start()