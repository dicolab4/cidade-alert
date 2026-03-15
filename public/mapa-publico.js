const map = L.map("map").setView([-22.52,-44.10],13)

L.tileLayer(
"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
).addTo(map)

// CLUSTER

const cluster = L.markerClusterGroup({

iconCreateFunction: function(cluster){

const count = cluster.getChildCount()

let cor = "cluster-small"

if(count > 10) cor = "cluster-medium"

if(count > 30) cor = "cluster-large"

return L.divIcon({
html:`<div><span>${count}</span></div>`,
className:`marker-cluster ${cor}`,
iconSize:L.point(40,40)
})

}

})

map.addLayer(cluster)

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

return d.toLocaleDateString("pt-BR")

}

async function carregar(){

cluster.clearLayers()

const filtro = document.getElementById("filtro").value

const res = await fetch("/api/ocorrencias")

const data = await res.json()

let listaHTML=""

data.forEach(o=>{

if(filtro && o.status !== filtro) return

const icon = L.circleMarker(
[o.latitude,o.longitude],
{
color:corCategoria(o.categoria),
radius:8,
fillColor:corCategoria(o.categoria),
fillOpacity:0.8
})

icon.bindPopup(`

<b>${o.categoria}</b><br>
${o.descricao}<br>

Status: ${o.status}<br>

Criado em: ${formatarData(o.data_criacao)}<br>

<img src="${o.foto_url}" width="200">

`)

cluster.addLayer(icon)

listaHTML += `
<div class="card">

<b>${o.categoria}</b>

<p>${o.descricao}</p>

<p>Status: ${o.status}</p>

<p>Criado em: ${formatarData(o.data_criacao)}</p>

</div>
`

})

document.getElementById("lista").innerHTML = listaHTML

}

carregar()