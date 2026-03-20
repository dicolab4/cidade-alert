// admin_script.js
const token = localStorage.getItem("token")
        if (!token) window.location = "login"

        let cidadesList = []

        // ===========================================
        // FUNÇÕES DE ABA
        // ===========================================
        function mudarAba(aba) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.includes(
                aba === 'usuarios' ? 'Usuários' : 
                aba === 'mensagens' ? 'Mensagens' : 
                aba === 'ocorrencias' ? 'Ocorrências' : 'SQL Query'
            ));
            if (btn) btn.classList.add('active');
            
            document.getElementById(`tab-${aba}`).classList.add('active');
            
            if (aba === 'usuarios') carregarUsuarios();
            if (aba === 'mensagens') carregarMensagens();
            if (aba === 'ocorrencias') carregarOcorrencias();
        }

        // ===========================================
        // CARREGAR DADOS INICIAIS
        // ===========================================
        async function carregarCidades() {
            const res = await fetch("/api/cidades")
            const cidades = await res.json()
            cidadesList = cidades
            
            let options = '<option value="">Selecione uma cidade</option>'
            let filtroOptions = '<option value="">Todas as cidades</option>'
            cidades.forEach(c => {
                options += `<option value="${c.codigo_ibge}">${c.nome} - ${c.uf}</option>`
                filtroOptions += `<option value="${c.codigo_ibge}">${c.nome} - ${c.uf}</option>`
            })
            document.getElementById("cidade").innerHTML = options
            document.getElementById("filtroCidade").innerHTML = filtroOptions
        }

        // async function carregarEstatisticas() {
        //     const res = await fetch("/api/admin/estatisticas", {
        //         headers: { "Authorization": `Bearer ${token}` }
        //     })
        //     const stats = await res.json()
            
        //     document.getElementById("totalUsuarios").textContent = stats.total_usuarios
        //     document.getElementById("totalOcorrencias").textContent = stats.total_ocorrencias
        //     document.getElementById("totalAdmins").textContent = stats.usuarios_por_tipo.admins
        //     document.getElementById("totalMensagens").textContent = stats.total_mensagens || 0
        // }

        // ===========================================
// CARREGAR DADOS INICIAIS
// ===========================================

async function carregarEstatisticas() {
    try {
        const res = await fetch("/api/admin/estatisticas", {
            headers: { "Authorization": `Bearer ${token}` }
        })
        const stats = await res.json()

        document.getElementById("totalUsuarios").textContent = stats.total_usuarios || 0
        document.getElementById("totalOcorrencias").textContent = stats.total_ocorrencias || 0
        document.getElementById("totalAdmins").textContent = stats.usuarios_por_tipo?.admins || 0
        document.getElementById("totalMensagens").textContent = stats.total_mensagens || 0

        console.log("📊 Estatísticas atualizadas:", {
            usuarios: stats.total_usuarios,
            ocorrencias: stats.total_ocorrencias,
            mensagens: stats.total_mensagens
        })
    } catch (error) {
        console.error("❌ Erro ao carregar estatísticas:", error)
    }
}

        // ===========================================
        // USUÁRIOS
        // ===========================================
        async function carregarUsuarios() {
            const res = await fetch("/api/admin/usuarios", {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const usuarios = await res.json()
            
            let html = ""
            usuarios.forEach(u => {
                html += `
                    <tr>
                        <td>${u.id}</td>
                        <td>${u.email || '-'}</td>
                        <td>${u.nome || '-'}</td>
                        <td style="font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${u.uuid || '-'}</td>
                        <td>${u.cidade_nome || '-'} ${u.uf || ''}</td>
                        <td class="${u.tipo === 1 ? 'tipo-admin' : u.tipo === 2 ? 'tipo-moderador' : ''}">
                            ${u.tipo === 1 ? 'Admin' : u.tipo === 2 ? 'Moderador' : 'Comum'}
                        </td>
                        <td class="${u.ativo ? 'ativo' : 'inativo'}">
                            ${u.ativo ? 'Ativo' : 'Inativo'}
                        </td>
                        <td>${u.fcm_token ? '✅ Sim' : '❌ Não'}</td>
                        <td>${new Date(u.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-edit" onclick="editarUsuario(${u.id})">✏️</button>
                            <button class="btn btn-toggle" onclick="toggleUsuario(${u.id})">
                                ${u.ativo ? '🔴' : '🟢'}
                            </button>
                        </td>
                    </tr>
                `
            })
            document.getElementById("tabelaUsuarios").innerHTML = html
        }

        function abrirModalUsuario(usuario = null) {
            document.getElementById("modalUsuarioTitulo").textContent = usuario ? "Editar Usuário" : "Novo Usuário"
            document.getElementById("usuarioId").value = usuario ? usuario.id : ""
            document.getElementById("email").value = usuario ? usuario.email : ""
            document.getElementById("senha").value = ""
            document.getElementById("nome").value = usuario ? usuario.nome || "" : ""
            document.getElementById("cidade").value = usuario ? usuario.codigo_ibge : ""
            document.getElementById("tipo").value = usuario ? usuario.tipo : 3
            document.getElementById("ativo").checked = usuario ? usuario.ativo : true
            document.getElementById("modalUsuario").style.display = "block"
        }

        function fecharModalUsuario() {
            document.getElementById("modalUsuario").style.display = "none"
        }

        async function salvarUsuario() {
            const id = document.getElementById("usuarioId").value
            const dados = {
                email: document.getElementById("email").value,
                senha: document.getElementById("senha").value,
                nome: document.getElementById("nome").value,
                cidade_ibge: document.getElementById("cidade").value || null,
                tipo: parseInt(document.getElementById("tipo").value),
                ativo: document.getElementById("ativo").checked
            }

            if (!dados.email) {
                alert("Email é obrigatório")
                return
            }

            if (!id && !dados.senha) {
                alert("Senha é obrigatória para novo usuário")
                return
            }

            const url = id ? `/api/admin/usuarios/${id}` : "/api/admin/usuarios"
            const method = id ? "PUT" : "POST"

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(dados)
            })

            if (res.ok) {
                alert(id ? "Usuário atualizado!" : "Usuário criado!")
                fecharModalUsuario()
                carregarUsuarios()
                carregarEstatisticas()
            } else {
                const erro = await res.json()
                alert("Erro: " + (erro.error || "Erro desconhecido"))
            }
        }

        async function editarUsuario(id) {
            const res = await fetch(`/api/admin/usuarios/${id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const usuario = await res.json()
            abrirModalUsuario(usuario)
        }

        async function toggleUsuario(id) {
            if (!confirm("Deseja alterar o status deste usuário?")) return
            
            const res = await fetch(`/api/admin/usuarios/${id}/toggle`, {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${token}` }
            })
            
            if (res.ok) {
                carregarUsuarios()
            } else {
                alert("Erro ao alterar status")
            }
        }

        // ===========================================
        // MENSAGENS
        // ===========================================
        async function carregarMensagens() {
            const filtro = document.getElementById("filtroMensagens").value
            let url = "/api/admin/mensagens"
            if (filtro !== "") url += `?lida=${filtro}`
            
            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const mensagens = await res.json()
            
            let html = ""
            mensagens.forEach(m => {
                html += `
                    <tr>
                        <td>${m.id}</td>
                        <td>${m.usuario_email || 'Anônimo'}</td>
                        <td>#${m.ocorrencia_id || '-'}</td>
                        <td>${m.titulo}</td>
                        <td style="max-width: 300px;">${m.mensagem.substring(0, 50)}${m.mensagem.length > 50 ? '...' : ''}</td>
                        <td class="${m.lida ? 'lida' : 'nao-lida'}">
                            ${m.lida ? '✓ Lida' : '⏳ Não lida'}
                        </td>
                        <td>${new Date(m.created_at).toLocaleString()}</td>
                        <td>
                            <button class="btn btn-view" onclick="verMensagem(${m.id})">👁️ Ver</button>
                        </td>
                    </tr>
                `
            })
            document.getElementById("tabelaMensagens").innerHTML = html || '<tr><td colspan="8">Nenhuma mensagem encontrada</td></tr>'
        }

        async function verMensagem(id) {
            const res = await fetch(`/api/admin/mensagens/${id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const msg = await res.json()
            
            document.getElementById("msgTitulo").innerText = msg.titulo
            document.getElementById("msgConteudo").innerText = msg.mensagem
            document.getElementById("msgData").innerText = new Date(msg.created_at).toLocaleString()
            document.getElementById("msgStatus").innerHTML = msg.lida ? '<span class="badge badge-success">Lida</span>' : '<span class="badge badge-warning">Não lida</span>'
            
            document.getElementById("modalMensagem").style.display = "block"
        }

        function fecharModalMensagem() {
            document.getElementById("modalMensagem").style.display = "none"
        }

        // ===========================================
        // OCORRÊNCIAS
        // ===========================================
        async function carregarOcorrencias() {
            const status = document.getElementById("filtroOcorrencias").value
            const cidade = document.getElementById("filtroCidade").value
            let url = "/api/admin/ocorrencias"
            let params = []
            if (status) params.push(`status=${status}`)
            if (cidade) params.push(`cidade=${cidade}`)
            if (params.length) url += `?${params.join('&')}`
            
            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const ocorrencias = await res.json()
            
            let html = ""
            ocorrencias.forEach(o => {
                html += `
                    <tr>
                        <td>${o.id}</td>
                        <td>${o.usuario_email || 'Anônimo'}</td>
                        <td>${o.cidade_nome || '-'} ${o.uf || ''}</td>
                        <td><span class="badge badge-warning">${o.categoria}</span></td>
                        <td style="max-width: 300px;">${o.descricao.substring(0, 50)}${o.descricao.length > 50 ? '...' : ''}</td>
                        <td class="${o.status === 'aberto' ? 'status-aberto' : 'status-concluido'}">
                            ${o.status === 'aberto' ? '🟡 Aberto' : '✅ Concluído'}
                        </td>
                        <td>${new Date(o.data_criacao).toLocaleString()}</td>
                        <td><a href="${o.foto_url}" target="_blank">📷 Ver</a></td>
                        <td>
                            <button class="btn btn-view" onclick="verOcorrencia(${o.id})">👁️ Ver</button>
                            ${o.status === 'aberto' ? `<button class="btn btn-concluir" onclick="concluirOcorrencia(${o.id})">✅ Concluir</button>` : ''}
                        </td>
                    </tr>
                `
            })
            document.getElementById("tabelaOcorrencias").innerHTML = html || '<tr><td colspan="9">Nenhuma ocorrência encontrada</td></tr>'
        }

        // async function concluirOcorrencia(id) {
        //     if (!confirm("Concluir esta ocorrência? O usuário será notificado.")) return
            
        //     const res = await fetch(`/api/admin/ocorrencias/${id}/concluir`, {
        //         method: "PUT",
        //         headers: { "Authorization": `Bearer ${token}` }
        //     })
            
        //     if (res.ok) {
        //         alert("✅ Ocorrência concluída! Usuário notificado.")
        //         carregarOcorrencias()
        //         carregarEstatisticas()
        //         carregarMensagens()
        //     } else {
        //         const erro = await res.json()
        //         alert("Erro: " + (erro.error || "Erro ao concluir"))
        //     }
        // }

        // ===========================================
// MENSAGENS - Atualizar contador após concluir
// ===========================================

async function concluirOcorrencia(id) {
    if (!confirm("Concluir esta ocorrência? O usuário será notificado.")) return
    
    try {
        const res = await fetch(`/api/admin/ocorrencias/${id}/concluir`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}` }
        })
        
        if (res.ok) {
            const data = await res.json()
            alert("✅ Ocorrência concluída! Usuário notificado.")
            
            // Recarregar todas as abas
            carregarOcorrencias()
            carregarMensagens()
            carregarEstatisticas()  // Isso vai atualizar o contador de mensagens
            
            // Se a resposta tiver o total de mensagens, atualizar diretamente
            if (data.total_mensagens !== undefined) {
                document.getElementById("totalMensagens").textContent = data.total_mensagens
            }
        } else {
            const erro = await res.json()
            alert("Erro: " + (erro.error || "Erro ao concluir"))
        }
    } catch (error) {
        console.error("Erro ao concluir ocorrência:", error)
        alert("Erro de conexão")
    }
}



        async function verOcorrencia(id) {
            const res = await fetch(`/api/admin/ocorrencias/${id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const o = await res.json()
            alert(`Ocorrência #${o.id}\n\nCategoria: ${o.categoria}\nDescrição: ${o.descricao}\nStatus: ${o.status}\nData: ${new Date(o.data_criacao).toLocaleString()}\nFoto: ${o.foto_url}`)
        }

        // ===========================================
        // SQL QUERY
        // ===========================================
        async function executarSQL() {
            const query = document.getElementById("sqlQuery").value.trim()
            
            if (!query) {
                alert("Digite uma consulta SQL")
                return
            }
            
            // Apenas consultas SELECT são permitidas por segurança
            if (!query.toUpperCase().startsWith('SELECT')) {
                alert("⚠️ Apenas consultas SELECT são permitidas por segurança")
                return
            }
            
            const resultDiv = document.getElementById("sqlResult")
            resultDiv.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ Executando consulta...</div>'
            
            try {
                const res = await fetch("/api/admin/sql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ query })
                })
                
                const data = await res.json()
                
                if (res.ok) {
                    if (data.rows && data.rows.length > 0) {
                        // Gerar tabela de resultados
                        const columns = Object.keys(data.rows[0])
                        let html = `
                            <div class="sql-success">✅ ${data.rowCount} linha(s) retornada(s) em ${data.executionTime}ms</div>
                            <div class="table-wrapper">
                                <table style="font-size: 12px;">
                                    <thead>
                                        <tr>
                                            ${columns.map(col => `<th>${col}</th>`).join('')}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.rows.map(row => `
                                            <tr>
                                                ${columns.map(col => `<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${row[col] !== null ? String(row[col]).substring(0, 100) : 'NULL'}</td>`).join('')}
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `
                        resultDiv.innerHTML = html
                    } else {
                        resultDiv.innerHTML = `<div class="sql-success">✅ Consulta executada com sucesso. Nenhuma linha retornada.</div>`
                    }
                } else {
                    resultDiv.innerHTML = `<div class="sql-error">❌ Erro: ${data.error || 'Erro desconhecido'}</div>`
                }
            } catch (error) {
                resultDiv.innerHTML = `<div class="sql-error">❌ Erro de conexão: ${error.message}</div>`
            }
        }
        
        function limparSQL() {
            document.getElementById("sqlQuery").value = ""
            document.getElementById("sqlResult").innerHTML = ""
        }
        
        function carregarExemplo() {
            document.getElementById("sqlQuery").value = `-- Exemplos de consultas:\n-- Ver últimos usuários\nSELECT id, email, nome, created_at FROM usuarios ORDER BY id DESC LIMIT 10;\n\n-- Ver ocorrências recentes\nSELECT id, categoria, status, data_criacao FROM ocorrencias ORDER BY id DESC LIMIT 10;\n\n-- Ver mensagens não lidas\nSELECT id, titulo, created_at FROM mensagens WHERE lida = false ORDER BY id DESC LIMIT 10;`
        }
        
        function carregarExemploTabela(tabela) {
            document.getElementById("sqlQuery").value = `SELECT * FROM ${tabela} ORDER BY id DESC LIMIT 20;`
            executarSQL()
        }

        // ===========================================
        // LOGOUT
        // ===========================================
        function logout() {
            localStorage.removeItem("token")
            localStorage.removeItem("usuario")
            window.location = "login"
        }

        // Inicialização
        carregarCidades()
        carregarUsuarios()
        carregarEstatisticas()