const map = L.map("map").setView([-22.52,-44.10],13)

L.tileLayer(
"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
).addTo(map)

fetch("/api/ocorrencias")
.then(res=>res.json())
.then(data=>{

data.forEach(o=>{

const marker = L.marker([o.latitude,o.longitude]).addTo(map)

marker.bindPopup(`
<b>${o.categoria}</b><br>
${o.descricao}<br>
<img src="/uploads/${o.foto_url}" width="200">
`)

})

})