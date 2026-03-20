// DASHBOARD ADMINISTRADOR 

// NÃO redeclarar token aqui - ele já existe no escopo global do HTML
// const token = localStorage.getItem("token")  <-- REMOVA ESTA LINHA

// Pegar dados do usuário do localStorage
let user = null
try {
    user = JSON.parse(localStorage.getItem("usuario"))
    console.log("👤 Usuário logado:", user)
} catch (e) {
    console.error("Erro ao carregar usuário")
}

const map = L.map("map").setView([-22.52,-44.10],13)

L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
).addTo(map)

// CLUSTER PERSONALIZADO
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
    return d.toLocaleDateString("pt-BR")+" "+
           d.toLocaleTimeString("pt-BR")
}

async function carregar(){
    cluster.clearLayers()

    const filtro = document.getElementById("filtro").value
    
    // Buscar ocorrências - filtrar por cidade se usuário estiver logado
    let url = "/api/ocorrencias"
    if (user && user.cidade_ibge) {
        url += `?cidade_ibge=${user.cidade_ibge}`
    }
    
    const res = await fetch(url)
    const data = await res.json()

    let listaHTML=""
    let contador=0
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

        if(categorias[o.categoria] !== undefined){
            categorias[o.categoria]++
        }

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

            cluster.addLayer(icon)
        }

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

    document.getElementById("contador").innerText =
        "Total de ocorrências: "+contador

    document.getElementById("categorias").innerHTML = `
        <b>Ocorrências por categoria</b><br><br>
        🕳 Buracos: ${categorias.buraco}<br>
        💡 Iluminação: ${categorias.iluminacao}<br>
        🌿 Mato alto: ${categorias.mato}<br>
        🗑 Lixo: ${categorias.lixo}<br>
        💧 Vazamentos: ${categorias.vazamento}
    `

    document.getElementById("lista").innerHTML = listaHTML
}

// Mostrar quantas mensagens foram enviadas
async function carregarEstatisticas() {
    try {
        const res = await fetch("/api/admin/estatisticas", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const stats = await res.json();
        
        if (stats.total_mensagens) {
            document.getElementById("mensagens-info").innerHTML = 
                `📨 ${stats.total_mensagens} mensagens enviadas`;
        }
    } catch(e) {
        console.log("Erro ao carregar estatísticas");
    }
}

// Chamar junto com carregar()
carregarEstatisticas();

async function concluir(id){
    await fetch("/api/ocorrencias/"+id+"/concluir",{
        method:"PUT"
    })
    alert("Ocorrência concluída")
    carregar()
}

carregar()
