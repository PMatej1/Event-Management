var express = require('express');
var router = express.Router();
const pool = require('../db');
const axios = require ("axios")

/* GET home page. */
router.get('/', async function(req, res, next) {

    try {
        const korisnici = await pool.query("select * from korisnik where uloga <> $1 order by korisnicko_ime asc", ["admin"]);
        console.log(korisnici.rows);
        const eventi = await pool.query("select * from event")
        console.log(eventi)

        res.render('admin', {title: 'Admin', users: korisnici.rows, eventi: eventi.rows});
    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get("/dodaj-tip-eventa", async (req, res)=>{
    try {
        const tipovi_eventa = await pool.query("select * from tip_eventa order by naziv_tipa asc")
        res.render("dodaj-tip-eventa", {tip_eventa: tipovi_eventa.rows})
    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
})

router.get("/dodaj-novu-lokaciju", async (req, res)=>{
    try {
        const trenutne_lokacije = await pool.query("select * from lokacija order by naziv asc")
        res.render("dodaj-novu-lokaciju", {trenutne_lokacije: trenutne_lokacije.rows})
    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
})

router.post('/delete-user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM korisnik WHERE id = $1', [id]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/block-user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('update korisnik set status = $2 WHERE id = $1', [id,"blokiran"]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/block-user-on-15-days/:id', async (req, res) => {
    const { id } = req.params;
    let today = new Date();
    let futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 15);

    try {
        await pool.query('update korisnik set status = $2, datum_deblokiranja=$3 WHERE id = $1', [id,"privremeno blokiran", futureDate]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/unblock-user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('update korisnik set status = $2, datum_deblokiranja=$3 WHERE id = $1', [id,"aktivan", null]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post("/dodaj-tip-eventa",async (req,res)=>{
    const {naziv}=req.body
    try {
        await pool.query("insert into tip_eventa (naziv_tipa) values ($1)", [naziv])
        const tipovi_eventa = await pool.query("select * from tip_eventa order by naziv_tipa asc")
        res.render("dodaj-tip-eventa", {tip_eventa:tipovi_eventa.rows})
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
})

router.post("/dodaj-novu-lokaciju",async (req,res)=>{
    const {naziv, latitude, longitude}=req.body

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: {
                lat: latitude,
                lon: longitude,
                format: 'json'
            }
        });

        const data = response.data;
        const address = data.address;

        const grad = address.city || address.town || address.village;
        const ulica = address.road;
        const postanski_broj = address.postcode;

        await pool.query("insert into lokacija (grad, ulica, postanski_broj, naziv) values ($1,$2, $3, $4) "
              ,[grad, ulica, postanski_broj, naziv])
        const trenutne_lokacije = await pool.query("select * from lokacija order by naziv asc")
        res.render("dodaj-novu-lokaciju", {trenutne_lokacije:trenutne_lokacije.rows})
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch geocode data' });
    }
})

router.post('/delete-tip-eventa/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM tip_eventa WHERE id = $1', [id]);
        res.redirect("/admin/dodaj-tip-eventa")
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/delete-lokacija/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM lokacija WHERE id = $1', [id]);
        res.redirect("/admin/dodaj-novu-lokaciju")
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/update-lokacija', async (req, res) => {
    const { id, naziv, grad, ulica, postanski_broj, latitude, longitude } = req.body;

    try {
        const updateQuery = `
            UPDATE lokacija 
            SET naziv = $1, grad = $2, ulica = $3, postanski_broj = $4 
            WHERE id = $5
        `;
        await pool.query(updateQuery, [naziv, grad, ulica, postanski_broj,  id]);

        res.redirect('/admin/dodaj-novu-lokaciju');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/statistika', async (req, res) => {
    try {
        const brojKorisnika = await pool.query('SELECT COUNT(*) FROM korisnik');
        const brojOrganizatora = await pool.query('SELECT COUNT(*) FROM korisnik WHERE uloga = $1', ['organizator']);
        const brojDogadjaja = await pool.query('SELECT COUNT(*) FROM event');
        const brojPrijava = await pool.query('SELECT COUNT(*) FROM prijavljeni_korisnici');
        const danas = new Date();

        const nadolazeciEventiSaNajvisePrijava = await pool.query(`
            SELECT event.naziv, COUNT(*) AS broj 
            FROM prijavljeni_korisnici 
            INNER JOIN event ON event.id = prijavljeni_korisnici.id_eventa
            WHERE datum > $1
            GROUP BY event.naziv 
            ORDER BY broj DESC 
            LIMIT 3
        `, [danas]);

        const zavrseniEventiSaNajvisePrijava = await pool.query(`
            SELECT event.naziv, COUNT(*) AS broj 
            FROM prijavljeni_korisnici 
            INNER JOIN event ON event.id = prijavljeni_korisnici.id_eventa
            WHERE datum < $1
            GROUP BY event.naziv 
            ORDER BY broj DESC 
            LIMIT 3
        `, [danas]);

        const organizatorSaNajviseEvenata = await pool.query(`
            SELECT korisnik.korisnicko_ime, COUNT(*) AS broj 
            FROM event 
            INNER JOIN korisnik ON korisnik.id = event.id_organizatora
            GROUP BY korisnik.korisnicko_ime
            ORDER BY broj DESC
        `);

        const korisnikSaNajvisePrihvatanja = await pool.query(`
            SELECT korisnik.korisnicko_ime, COUNT(*) AS broj 
            FROM prijavljeni_korisnici 
            INNER JOIN korisnik ON korisnik.id = prijavljeni_korisnici.id_korisnika 
            WHERE prijavljeni_korisnici.status = $1
            GROUP BY korisnik.korisnicko_ime 
            ORDER BY broj DESC 
            LIMIT 3
        `, [ 'odobren']);

        const korisnikSaNajviseOdbijanja = await pool.query(`
            SELECT korisnik.korisnicko_ime, COUNT(*) AS broj 
            FROM prijavljeni_korisnici 
            INNER JOIN korisnik ON korisnik.id = prijavljeni_korisnici.id_korisnika 
            WHERE prijavljeni_korisnici.status = $1 
            GROUP BY korisnik.korisnicko_ime 
            ORDER BY broj DESC 
            LIMIT 3
        `, [ 'odbijen']);

        const tipSaNajviseEvenata = await pool.query(`
            SELECT tip_eventa.naziv_tipa, COUNT(*) AS broj 
            FROM event 
            INNER JOIN tip_eventa ON tip_eventa.id = event.id_tipa
            GROUP BY tip_eventa.naziv_tipa
            ORDER BY broj DESC
        `);

        const gradSaNajviseEvenata = await pool.query(`
            SELECT lokacija.grad, COUNT(*) AS broj 
            FROM event 
            INNER JOIN lokacija ON lokacija.id = event.id_lokacije
            GROUP BY lokacija.grad
            ORDER BY broj DESC
        `);

        const najboljeOcijenjeniEventi = await pool.query(`
            SELECT event.naziv, AVG(recenzija) AS prosjek 
            FROM event 
            INNER JOIN recenzija ON recenzija.id_eventa = event.id
            GROUP BY event.naziv 
            ORDER BY prosjek DESC 
            LIMIT 3
        `);

        const tipoviEvenataZaKojeSeKorisniciOdlucujuNajvise = await pool.query(`
            SELECT tip_eventa.naziv_tipa, COUNT(*) AS broj 
            FROM interesi_korisnika 
            INNER JOIN tip_eventa ON tip_eventa.id = interesi_korisnika.id_tipa
            GROUP BY tip_eventa.naziv_tipa
            ORDER BY broj DESC
        `);


        res.render('statistika', {
            brojKorisnika: brojKorisnika.rows[0].count,
            brojOrganizatora: brojOrganizatora.rows[0].count,
            brojDogadjaja: brojDogadjaja.rows[0].count,
            brojPrijava: brojPrijava.rows[0].count,
            nadolazeciEventiSaNajvisePrijava: JSON.stringify(nadolazeciEventiSaNajvisePrijava.rows),
            zavrseniEventiSaNajvisePrijava: JSON.stringify(zavrseniEventiSaNajvisePrijava.rows),
            organizatorSaNajviseEvenata: JSON.stringify(organizatorSaNajviseEvenata.rows),
            korisnikSaNajvisePrihvatanja: JSON.stringify(korisnikSaNajvisePrihvatanja.rows),
            korisnikSaNajviseOdbijanja: JSON.stringify(korisnikSaNajviseOdbijanja.rows),
            tipSaNajviseEvenata: JSON.stringify(tipSaNajviseEvenata.rows),
            gradSaNajviseEvenata: JSON.stringify(gradSaNajviseEvenata.rows),
            najboljeOcijenjeniEventi: JSON.stringify(najboljeOcijenjeniEventi.rows),
            tipoviEvenataZaKojeSeKorisniciOdlucujuNajvise: JSON.stringify(tipoviEvenataZaKojeSeKorisniciOdlucujuNajvise.rows)
        });
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});


router.post('/edit-tip-eventa/:id', async (req, res) => {
    const { id } = req.params;
    const { naziv } = req.body;
    try {
        await pool.query('UPDATE tip_eventa SET naziv_tipa = $1 WHERE id = $2', [naziv, id]);
        res.redirect('/admin/dodaj-tip-eventa'); // Redirektujte nazad na stranicu sa tipovima eventa
    } catch (err) {
        console.error(err);
        res.send("Error " + err);
    }
});



module.exports = router;