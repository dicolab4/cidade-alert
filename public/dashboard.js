const map = L.map("map").setView([-22.52,-44.10],13)

L.tileLayer(
"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
).addTo(map)

const cluster = L.markerClusterGroup()

map.addLayer(cluster)

function corCategoria(cat){

if(cat==="buraco") return "red"
if(cat==="iluminacao") return "yellow"
if(cat==="mato") return "green"

return "blue"

}

async function carregar(){

cluster.clearLayers()

const filtro = document.getElementById("filtro").value

const res = await fetch("/api/ocorrencias")

const data = await res.json()

let listaHTML=""

let contador=0

data.forEach(o=>{

if(filtro && o.status!==filtro) return

contador++

const icon = L.circleMarker(
[o.latitude,o.longitude],
{
color:corCategoria(o.categoria),
radius:8
})

icon.bindPopup(`

<b>${o.categoria}</b><br>
${o.descricao}<br>
Status: ${o.status}<br>

<img src="/uploads/${o.foto_url}" width="200">

<br><br>

<button onclick="concluir(${o.id})">
Concluir
</button>

`)

cluster.addLayer(icon)

listaHTML += `
<div class="card">

<b>${o.categoria}</b>

<p>${o.descricao}</p>

<p>Status: ${o.status}</p>

</div>
`

})

document.getElementById("contador").innerText =
"Total: "+contador

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

carregar()