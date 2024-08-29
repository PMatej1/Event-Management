var express = require('express');
var router = express.Router();
var pool = require("../db");
var http = require('http');
var socketIo = require('socket.io');

// Postavite router i socket.io server
var server = http.createServer(); // Ovaj server ne bi trebao biti ovdje
var io = socketIo(server);

const isAuth = (req, res, next) => {
    if(req.session.isAuth){
        next();
    } else {
        res.redirect("/login");
    }
};

router.use(isAuth);

// Rukovanje GET zahtjevom za chat
router.get('/', function(req, res, next) {
    res.render("chat"); // Renderujte chat bez socket.io logike ovdje
});

// Emitujte poruke u server.js umjesto ovdje
module.exports = { router, io }; // Izvozite io
