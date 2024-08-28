var express = require('express');
var router = express.Router();
const pool = require('../db');

const isAuth = (req, res, next) => {
    if(req.session.isAuth){
        next();
    }else {
        res.redirect("/login")
    }
}
router.use(isAuth)

const isOrganizer = (req, res, next) => {
    if(req.session.isOrganizer){
        next();
    }else {
        req.session.isAdmin ?  res.redirect('/admin') : res.redirect('/korisnik')
    }
}
router.use(isOrganizer);



router.get('/', async (req, res) => {

    const id = req.session.userId;
    console.log(req.session)
    const prijave= await pool.query("select k.ime as ime, k.prezime as prezime,  upit1.id_eventa as id_eventa, upit1.naziv as naziv from korisnik as k" +
        " inner join ( select pk.id_korisnika as id_korisnika, upit.id as id_eventa, upit.naziv as naziv from prijavljeni_korisnici as pk inner join" +
        "( select id as id, naziv as naziv from event where id_organizatora=$1) as upit on pk.id_eventa=upit.id) as upit1 on k.id=upit1.id_korisnika", [id])
    const result = await pool.query('SELECT * FROM korisnik WHERE id = $1', [id]);
   console.log("vazno", result.rows[0])
    res.render('organizator', { organizator: result.rows[0], obavijesti:prijave.rows });
});

router.post("/update-profile", async (req, res) =>{

    const id = req.session.userId;
    const {ime,prezime,email,korisnicko_ime}=req.body;
    try {
        await pool.query("update korisnik set ime=$1, prezime=$2, email=$3, korisnicko_ime=$4 where id=$5", [ime, prezime, email, korisnicko_ime, id])
        res.redirect(`/organizator`)
    }catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }



})

router.get('/eventi', async (req, res) => {

    const id = req.session.userId;
    try {
        const eventsResult = await
            pool.query('select upit.id as id,  upit.naziv as naziv, upit.opis as opis, upit.datum as datum, upit.cijena as cijena, upit.status as status, upit.tip as tip,' +
                '  lokacija.naziv || \', \' || lokacija.grad || \', \' || lokacija.ulica AS mjesto' +
                '  from lokacija inner join ' +
                '(SELECT event.id as id, event.id_lokacije as id_lokacije, event.naziv as naziv, event.opis as opis, event.datum as datum, event.cijena as cijena, event.status as status, tip_eventa.naziv_tipa as tip ' +
                'FROM event INNER JOIN tip_eventa ON event.id_tipa = tip_eventa.id WHERE event.id_organizatora = $1) as upit on upit.id_lokacije=lokacija.id order by upit.datum asc', [id]);
        const lokacijeResult = await pool.query('SELECT id, naziv || \', \' || grad || \', \' || ulica AS mjesto FROM lokacija order by grad asc');
        const tipoviResult = await pool.query('SELECT id, naziv_tipa FROM tip_eventa order by naziv_tipa asc');
        res.render('eventi-organizatora', { eventi: eventsResult.rows,lokacije: lokacijeResult.rows,
            tipovi: tipoviResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.get("/event/:id", async (req , res)=>{
    let danas = new Date();
    let zavrsen=false;
    let recenzije=false;
    const {id}=req.params;
    try{
        const event=await
            pool.query('select upit.id as id,  upit.naziv as naziv, upit.opis as opis, upit.datum as datum, upit.cijena as cijena, upit.status as status, upit.tip as tip,' +
                '  lokacija.naziv || \', \' || lokacija.grad || \', \' || lokacija.ulica AS mjesto' +
                '  from lokacija inner join ' +
                '(SELECT event.id as id, event.id_lokacije as id_lokacije, event.naziv as naziv, event.opis as opis, event.datum as datum, event.cijena as cijena, event.status as status, tip_eventa.naziv_tipa as tip ' +
                'FROM event INNER JOIN tip_eventa ON event.id_tipa = tip_eventa.id WHERE event.id = $1) as upit on upit.id_lokacije=lokacija.id order by upit.datum asc', [id]);
        const spisak_prijavljenih=await pool.query("select korisnik.ime, korisnik.prezime, korisnik.korisnicko_ime, pk.status from korisnik inner join" +
            " prijavljeni_korisnici as pk on korisnik.id=pk.id_korisnika where pk.id_eventa=$1 ", [id])
        if (danas>event.rows[0].datum){
             zavrsen=true;
             recenzije=await pool.query("select recenzija, komentar from recenzija where id_eventa = $1", [event.rows[0].id])
        }
        if (recenzije)
             res.render("event", {event:event, spisak_prijavljenih:spisak_prijavljenih, recenzije:recenzije.rows, zavrsen:zavrsen})
        res.render("event", {event:event, spisak_prijavljenih:spisak_prijavljenih,  zavrsen:zavrsen})
    }catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }

})

router.post('/dodaj-event', async (req, res) => {
    console.log(req.body)
    const { naziv, opis, datum, cijena, id_lokacije, id_tipa } = req.body;
    //const userId = req.session.userId; // Assuming you have user session management
    const id = req.session.userId;
    try {
        await pool.query(
            'INSERT INTO event (naziv, opis, datum, cijena, status, id_lokacije, id_tipa, id_organizatora) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [naziv, opis, datum, cijena, "aktivan", id_lokacije, id_tipa, id]
        );
        res.redirect('/organizator/eventi'); // promijeniti ovo
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/update-event/:id', async (req, res) => {

    const { naziv, opis, datum, cijena, status, id_lokacije, id_tipa } = req.body;

    const {id}=req.params;
    try {
        await pool.query(
            'update event set naziv=$1, opis=$2, datum=$3, cijena=$4, status=$5, id_lokacije=$6, id_tipa=$7 where id=$8',
            [naziv, opis, datum, cijena, status, id_lokacije, id_tipa, id]
        );
        res.redirect(`/organizator/eventi`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/delete-event/:id', async (req, res) => {

    const { id } = req.params;
    try {
        await pool.query('DELETE FROM event WHERE id = $1', [id]);
        res.redirect('/organizator/eventi');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


router.post('/event/:eventId/accept-user/:username', async (req, res) => {

    const { eventId, username } = req.params;
    let id_korisnika=await pool.query("select id from korisnik where korisnicko_ime=$1", [username])
    id_korisnika=id_korisnika.rows[0].id;
    try {
        await pool.query("UPDATE prijavljeni_korisnici SET status = 'odobren' WHERE id_eventa = $1 AND id_korisnika = $2", [eventId, id_korisnika]);
        res.redirect(`/organizator/event/${eventId}`);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.post('/event/:eventId/reject-user/:username', async (req, res) => {

    const { eventId, username } = req.params;
    let id_korisnika=await pool.query("select id from korisnik where korisnicko_ime=$1", [username])
    id_korisnika=id_korisnika.rows[0].id;
    try {
        await pool.query("UPDATE prijavljeni_korisnici SET status = 'odbijen' WHERE id_eventa = $1 AND id_korisnika = $2", [eventId, id_korisnika]);
        res.redirect(`/organizator/event/${eventId}`);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
