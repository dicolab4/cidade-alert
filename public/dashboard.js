// DASHBOARD ADMINISTRADOR

const map = L.map("map").setView([-22.52,-44.10],13)

L.tileLayer(
"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
).addTo(map)

// lista de marcadores ativos no mapa
let marcadores = []

function corCategoria(cat){

if(cat==="mato") return "green"

if(cat==="vazamento") return "blue"

if(cat==="buraco") return "black"

if(cat==="iluminacao") return "yellow"

if(cat==="lixo") return "red"

return "gray"

}

function formatarData(data){

if(!data) return "-"

const d = new Date(data)

return d.toLocaleDateString("pt-BR")+" "+
d.toLocaleTimeString("pt-BR")

}

async function carregar(){

// remove marcadores antigos
marcadores.forEach(m => map.removeLayer(m))
marcadores = []

const filtro = document.getElementById("filtro").value

const res = await fetch("/api/ocorrencias")

const data = await res.json()

let listaHTML=""

let contador=0

// contador por categoria
let categorias={
buraco:0,
iluminacao:0,
mato:0,
lixo:0,
vazamento:0
}

data.forEach(o=>{

if(filtro && o.status!==filtro) return

contador++

// soma categoria
if(categorias[o.categoria] !== undefined){
categorias[o.categoria]++
}

// MARCADOR NO MAPA (somente se não estiver concluído)

if(o.status !== "concluido"){

const icon = L.circleMarker(
[o.latitude,o.longitude],
{
color:corCategoria(o.categoria),
radius:7,
weight:2,
fillOpacity:0.8
})

icon.bindPopup(`

<b>${o.categoria}</b><br>
${o.descricao}<br>

Status: ${o.status}<br>

Criado em: ${formatarData(o.data_criacao)}<br>

<img src="${o.foto_url}" width="200">

<br><br>

<button onclick="concluir(${o.id})">
Concluir
</button>

`)

icon.addTo(map)

marcadores.push(icon)

}

// LISTA DE OCORRÊNCIAS

listaHTML += `
<div class="card">

<b>${o.categoria}</b>

<p>${o.descricao}</p>

<p class="status-${o.status}">
Status: ${o.status}
</p>

<p>Criado em: ${formatarData(o.data_criacao)}</p>

<p>Concluído em: ${formatarData(o.data_conclusao)}</p>

</div>
`

})

// TOTAL GERAL

document.getElementById("contador").innerText =
"Total de ocorrências: "+contador

// CONTADOR POR CATEGORIA

document.getElementById("categorias").innerHTML = `
<b>Ocorrências por categoria</b><br><br>

🕳 Buracos: ${categorias.buraco}<br>
💡 Iluminação: ${categorias.iluminacao}<br>
🌿 Mato alto: ${categorias.mato}<br>
🗑 Lixo: ${categorias.lixo}<br>
💧 Vazamentos: ${categorias.vazamento}
`

document.getElementById("lista").innerHTML =
listaHTML

}

async function concluir(id){

await fetch("/api/ocorrencias/"+id+"/concluir",{

method:"PUT"

})

alert("Ocorrência concluída")

carregar()

}

// carrega ao abrir
carregar()