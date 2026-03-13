const pool = require("./db")

async function migrate() {

await pool.query(`

CREATE TABLE IF NOT EXISTS usuarios (
 id SERIAL PRIMARY KEY,
 email VARCHAR(120) UNIQUE NOT NULL,
 senha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ocorrencias (
 id SERIAL PRIMARY KEY,
 descricao TEXT,
 categoria VARCHAR(50),
 latitude DECIMAL,
 longitude DECIMAL,
 foto_url TEXT,
 status VARCHAR(20) DEFAULT 'aberto',
 data_criacao TIMESTAMP DEFAULT NOW(),
 data_conclusao TIMESTAMP
);

`)

const user = await pool.query(
"SELECT * FROM usuarios WHERE email='admin@admin.com'"
)

if(user.rows.length === 0){

await pool.query(
`INSERT INTO usuarios(email,senha)
VALUES('admin@admin.com','123456')`
)

}

console.log("Migration concluída")
process.exit()

}

migrate()