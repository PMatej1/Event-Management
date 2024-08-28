var express = require('express');
var router = express.Router();
var pool = require("../db")

const isAuth = (req, res, next) => {
    if(req.session.isAuth){
        next();
    }else {
        res.redirect("/login")
    }
}
router.use(isAuth)

router.get('/', function(req, res, next) {
    res.render("chat")
});

module.exports=router