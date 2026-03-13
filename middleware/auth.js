const jwt = require("jsonwebtoken")

module.exports = function(req,res,next){

const token = req.headers.authorization

if(!token){
return res.status(401).json({erro:"token ausente"})
}

try{

const decoded = jwt.verify(
token.replace("Bearer ",""),
process.env.JWT_SECRET
)

req.user = decoded
next()

}catch{

res.status(401).json({erro:"token inválido"})

}

}