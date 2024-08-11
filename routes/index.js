var express = require('express');
var router = express.Router();
const pool = require('../db');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/login', function(req, res, next) {
  res.render('login', {error: false});
});

// treba asinhrono
router.post('/login', async function(req, res, next) {
  try {
    console.log(req.body.email, req.body.sifra)
    let email = req.body.email;
    let password = req.body.sifra;
    const result = await pool.query('SELECT * FROM korisnik WHERE email = $1', [email]);
    console.log(result.rows);
    if (result.rows.length > 0) {
      if (result.rows[0].sifra === password) {
        if (result.rows[0].uloga==="user")
          res.redirect("/korisnik/feed")
        else if (result.rows[0].uloga==="organizer")
          res.redirect("/organizator/1")
        else
          res.redirect("/admin")
      }
      else
        res.render("login", {error: "pogresna lozinka"})
    } else
      res.render("login", {error: "pogresno korisnicko ime"})
  }catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }


});

router.get('/register', function(req, res, next) {
  res.render('register', {error:false});
});

router.post("/register", async (req, res)=>{

  try {
    const {email, password, confirmPassword, firstName, lastName, username, role} = req.body;
    const result = await pool.query("select * from korisnik where email = $1", [email]);
    if (result.rows.length > 0) {
      res.render("register", {error: "Ovaj email se već koristi"})
      return;
    } else if (password !== confirmPassword) {
      res.render("register", {error: "Provjerite lozinku"})
      return;
    } else {
      let provjera_korisnickog_imena = await pool.query("select * from korisnik where korisnicko_ime = $1", [username])
      if (provjera_korisnickog_imena.rows.length > 0) {
        res.render("register", {error: "Zauzeto korisničko ime"})
        return;
      }
    }

    await pool.query("insert into korisnik (email, uloga, ime, prezime, sifra,korisnicko_ime, status )" +
        " values ($1, $2, $3, $4, $5, $6, $7)", [email, role, firstName, lastName, password, username, "aktivan"])

    if (role==="organizer")
      res.render("login", {error: false})
    else {
      const novi_id=await pool.query("select id from korisnik where korisnicko_ime=$1", [username])
      const ponudjeni_tipovi=await pool.query("select id, naziv_tipa from tip_eventa ")
      res.render("interesi_korisnika", {ponudjeni_tipovi:ponudjeni_tipovi, novi_id:novi_id.rows[0].id})
    }
  }catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }

})
// korigovati
router.post('/korisnik/sacuvaj-interese/:id', async (req, res) => {
  try {
    const {id}=req.params;
    const interesi = req.body.interesi;
  console.log(req.body)

    // Zatim dodajte nove interese
    if (Array.isArray(interesi) && interesi.length > 0) {
      const values = interesi.map(interes => `(${id}, ${interes})`).join(',');
      const query = `INSERT INTO interesi_korisnika (id_korisnika, id_tipa) VALUES ${values}`;
      await pool.query(query);
    }

    res.redirect('/login'); // Promijenite ovo na rutu gdje želite preusmjeriti korisnika nakon uspješnog unosa
  } catch (error) {
    console.error(error);
    res.status(500).send('Greška pri spremanju interesa');
  }
});

module.exports = router;
