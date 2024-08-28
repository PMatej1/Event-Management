var express = require('express');
var bcrypt = require("bcrypt")
var router = express.Router();
const pool = require('../db');

/* GET home page. */
router.get('/', async function(req, res, next) {
 let a=await pool.query('select * from interesi_korisnika')
  console.log(a);

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
      let uloga=result.rows[0].uloga;
      let id=result.rows[0].id;

      bcrypt.compare(password, result.rows[0].sifra, function(err, result) {
        if (err) {
          console.error(err);
        } else if (result) {
          console.log("Lozinka je ispravna!");
          req.session.isAuth=true;
          req.session.userId=id;
          if (uloga==="user") {
            req.session.isUser=true;
            req.session.isOrganizer=false;
            req.session.isAdmin=false;
            res.redirect("/korisnik/feed")
          }
          else if (uloga==="organizer") {
            req.session.isUser=false;
            req.session.isOrganizer=true;
            req.session.isAdmin=false;
            res.redirect(`/organizator`)
          }
          else {
            req.session.isUser=false;
            req.session.isOrganizer=false;
            req.session.isAdmin=true;
            res.redirect("/admin")
          }
        } else {
          console.log("Pogrešna lozinka!");
          // Autentifikacija neuspešna
        }
      });
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
    let {email, password, confirmPassword, firstName, lastName, username, role} = req.body;
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

    await bcrypt.hash(password, 10, async function(err, hash) {
      if (err) {
        console.error(err);
      } else {
        console.log("Heširana lozinka:", hash);

        pool.query("insert into korisnik (email, uloga, ime, prezime, sifra,korisnicko_ime, status )" +
            " values ($1, $2, $3, $4, $5, $6, $7)", [email, role, firstName, lastName, hash, username, "aktivan"])
        if (role==="organizer")
          res.redirect("/login")
        else {
          try {
            // Dobivanje ID-a korisnika na osnovu korisničkog imena
            const result_id = await pool.query("SELECT id FROM korisnik WHERE korisnicko_ime = $1", [username]);

            // Provjera da li je pronađen korisnik
            if (result_id.rows.length === 0) {
              return res.status(404).send("Korisnik nije pronađen.");
            }

            const novi_id = result_id.rows[0].id;

            // Dobavljanje svih tipova događaja
            const result_tipovi = await pool.query("SELECT id, naziv_tipa FROM tip_eventa");
            console.log(novi_id, result_tipovi.rows, "vazno")
            // Renderovanje EJS stranice i prosljeđivanje podataka
            res.render("interesi_korisnika", { ponudjeni_tipovi: result_tipovi.rows, novi_id: novi_id });
          } catch (error) {
            console.error("Greška u upitima:", error);
            res.status(500).send("Došlo je do greške na serveru.");
          }
        }
      }

    });}


    catch (err) {
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

router.post('/logout', async (req, res) => {


  req.session.destroy((err) => {
    if(err) throw err;
    res.redirect('/');
  })
})

module.exports = router;
