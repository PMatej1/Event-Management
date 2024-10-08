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
const isUser = (req, res, next) => {
    if(req.session.isUser){
        next();
    }else {
       req.session.isAdmin ?  res.redirect('/admin') : res.redirect('/organizator')
    }
}
router.use(isUser);

router.get('/', async function(req, res, next) {
    const id = req.session.userId;
    try {
        const result = await pool.query('SELECT * FROM korisnik WHERE id = $1', [id]);
        const korisnikovi_interesi= await pool.query("select te.naziv_tipa, te.id from tip_eventa as te inner join " +
            " interesi_korisnika as ik on te.id=ik.id_tipa where id_korisnika=$1", [id])
        const korisnikovi_ne_interesi=await pool.query('SELECT te.naziv_tipa, te.id ' +
            ' FROM tip_eventa te LEFT JOIN interesi_korisnika ik ON te.id = ik.id_tipa AND ik.id_korisnika = $1' +
            ' WHERE ik.id_tipa IS NULL;'
            , [id])

        res.render('korisnik', { korisnik: result.rows[0],
            korisnikovi_interesi:korisnikovi_interesi, korisnikovi_ne_interesi:korisnikovi_ne_interesi });
    }catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});



router.post('/dodaj-interes', async (req, res) => {


    const { interes_id, korisnik_id } = req.body;
    console.log(req.body)

    await pool.query(
        'INSERT INTO interesi_korisnika (id_tipa, id_korisnika) VALUES ($1, $2)',
        [interes_id, korisnik_id]
    );

    res.redirect(`/korisnik`);
});

router.post('/obrisi-interes', async (req, res) => {
    if (!req.session.isAuth) {
        res.redirect("/login")
        return
    }
    const { interes_id, korisnik_id } = req.body;
    console.log(req.body)

    await pool.query(
        'delete from interesi_korisnika where id_tipa=$1 and id_korisnika=$2',
        [interes_id, korisnik_id]
    );

    res.redirect(`/korisnik`);
});

router.post("/update-profile", async (req, res) =>{

    const id = req.session.userId;
    const {ime,prezime,email,korisnicko_ime}=req.body;
    try {
        await pool.query("update korisnik set ime=$1, prezime=$2, email=$3, korisnicko_ime=$4 where id=$5", [ime, prezime, email, korisnicko_ime, id])
        res.redirect(`/korisnik`)
    }catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }



})

router.get('/feed', async (req, res) => {
    const lokacijeResult = await pool.query('SELECT id, naziv || \', \' || grad || \', \' || ulica AS mjesto FROM lokacija order by grad asc');
    const tipoviResult = await pool.query('SELECT id, naziv_tipa FROM tip_eventa order by naziv_tipa asc');

    const id=req.session.userId;
    try {
        let { tip, status, sortiraj } = req.query;

        let eventsQuery = `
    SELECT upit.id as id, upit.naziv as naziv, upit.opis as opis, upit.datum as datum, 
           upit.cijena as cijena, upit.status as status, upit.tip as tip, 
           lokacija.naziv || ', ' || lokacija.grad || ', ' || lokacija.ulica AS mjesto 
    FROM lokacija 
    INNER JOIN (
        SELECT event.id as id, event.id_lokacije as id_lokacije, event.naziv as naziv, 
               event.opis as opis, event.datum as datum, event.cijena as cijena, 
               event.status as status, tip_eventa.naziv_tipa as tip 
        FROM event 
        INNER JOIN tip_eventa ON event.id_tipa = tip_eventa.id 
        WHERE event.id NOT IN (
            SELECT id_eventa FROM prijavljeni_korisnici WHERE id_korisnika=$1
        )
    ) as upit ON upit.id_lokacije = lokacija.id 
    WHERE 1=1
`;

        if (tip) {
            eventsQuery += ` AND upit.tip = '${tip}'`;
        }

        if (status) {
            eventsQuery += ` AND upit.status = '${status}'`;
        }

        if (sortiraj) {
            eventsQuery += ` ORDER BY ${sortiraj}`;
        } else {
            eventsQuery += ` ORDER BY RANDOM() LIMIT 5`;
        }

        const eventsResult = await pool.query(eventsQuery, [id]);

        let najboljeOcijenjeniQuery = `
    SELECT upit.id AS id, upit.naziv AS naziv, upit.opis AS opis, upit.datum AS datum, 
           upit.cijena AS cijena, upit.status AS status, upit.tip AS tip, 
           upit.mjesto AS mjesto, recenzija_avg.prosjek AS prosjek_recenzija
    FROM (
        SELECT event.id AS id, event.naziv AS naziv, event.opis AS opis, 
               event.datum AS datum, event.cijena AS cijena, event.status AS status, 
               tip_eventa.naziv_tipa AS tip, 
               lokacija.naziv || ', ' || lokacija.grad || ', ' || lokacija.ulica AS mjesto 
        FROM event 
        INNER JOIN tip_eventa ON event.id_tipa = tip_eventa.id
        INNER JOIN lokacija ON event.id_lokacije = lokacija.id
        WHERE 1=1
`;

        if (tip) {
            najboljeOcijenjeniQuery += ` AND tip_eventa.naziv_tipa = '${tip}'`;
        }

        if (status) {
            najboljeOcijenjeniQuery += ` AND event.status = '${status}'`;
        }

        najboljeOcijenjeniQuery += `
    ) AS upit 
    INNER JOIN (
        SELECT recenzija.id_eventa, AVG(recenzija.recenzija) AS prosjek 
        FROM recenzija 
        GROUP BY recenzija.id_eventa 
        ORDER BY prosjek DESC 
        LIMIT 5
    ) AS recenzija_avg ON recenzija_avg.id_eventa = upit.id 
`;

        if (sortiraj) {
            najboljeOcijenjeniQuery += ` ORDER BY ${sortiraj}`;
        } else {
            najboljeOcijenjeniQuery += ` ORDER BY recenzija_avg.prosjek DESC`;
        }

        const najbolje_ocijenjeni_zavrseni_eventi = await pool.query(najboljeOcijenjeniQuery);

        let najpopularnijiQuery = `
    SELECT 
        upit.id AS id,  
        upit.naziv AS naziv, 
        upit.opis AS opis, 
        upit.datum AS datum, 
        upit.cijena AS cijena, 
        upit.status AS status, 
        upit.tip AS tip,
        upit.mjesto AS mjesto,
        novi_upit.broj_prijava AS broj_prijava
    FROM (
        SELECT 
            event.id AS id, 
            event.naziv AS naziv, 
            event.opis AS opis, 
            event.datum AS datum, 
            event.cijena AS cijena, 
            event.status AS status, 
            tip_eventa.naziv_tipa AS tip,
            lokacija.naziv || ', ' || lokacija.grad || ', ' || lokacija.ulica AS mjesto 
        FROM 
            lokacija 
        INNER JOIN 
            event 
        ON 
            event.id_lokacije = lokacija.id 
        INNER JOIN 
            tip_eventa 
        ON 
            event.id_tipa = tip_eventa.id 
        WHERE event.id NOT IN (SELECT id_eventa FROM prijavljeni_korisnici WHERE id_korisnika = $1)
    ) AS upit 
    INNER JOIN (
        SELECT 
            pk.id_eventa, 
            COUNT(*) AS broj_prijava 
        FROM 
            prijavljeni_korisnici AS pk 
        GROUP BY 
            pk.id_eventa 
        ORDER BY 
            broj_prijava DESC
        LIMIT 5
    ) AS novi_upit 
    ON novi_upit.id_eventa = upit.id 
    WHERE 1=1
`;

        if (tip) {
            najpopularnijiQuery += ` AND upit.tip = '${tip}'`;
        }

        if (status) {
            najpopularnijiQuery += ` AND upit.status = '${status}'`;
        }

        if (sortiraj) {
            najpopularnijiQuery += ` ORDER BY ${sortiraj}`;
        } else {
            najpopularnijiQuery += ` ORDER BY novi_upit.broj_prijava DESC`;
        }

        const najpopularniji_eventi = await pool.query(najpopularnijiQuery, [id]);



        let recommendedQuery = `
    SELECT upit.id_tipa as id_tipa, upit.id as id,  upit.naziv as naziv, 
           upit.opis as opis, upit.datum as datum, upit.cijena as cijena, 
           upit.status as status, upit.tip as tip, 
           lokacija.naziv || ', ' || lokacija.grad || ', ' || lokacija.ulica AS mjesto 
    FROM lokacija 
    INNER JOIN (
        SELECT event.id as id, event.id_lokacije as id_lokacije, event.naziv as naziv, 
               event.opis as opis, event.datum as datum, event.cijena as cijena, 
               event.status as status, tip_eventa.naziv_tipa as tip, 
               tip_eventa.id as id_tipa 
        FROM event 
        INNER JOIN tip_eventa ON event.id_tipa = tip_eventa.id 
        WHERE event.id NOT IN (
            SELECT id_eventa FROM prijavljeni_korisnici WHERE id_korisnika=$1
        )
    ) as upit ON upit.id_lokacije=lokacija.id 
    WHERE upit.id_tipa IN (
        SELECT id_tipa FROM interesi_korisnika WHERE id_korisnika = $1
    )
`;

        if (tip) {
            recommendedQuery += ` AND upit.id_tipa = '${tip}'`;
        }

        if (status) {
            recommendedQuery += ` AND upit.status = '${status}'`;
        }

        if (sortiraj) {
            recommendedQuery += ` ORDER BY ${sortiraj}`;
        } else {
            recommendedQuery += ` ORDER BY upit.datum ASC`;
        }

        const recommendedEventi = await pool.query(recommendedQuery, [id]);




        res.render('feed', { eventi: eventsResult.rows, najpopularniji_eventi:najpopularniji_eventi.rows,
            najbolje_ocijenjeni_zavrseni_eventi:najbolje_ocijenjeni_zavrseni_eventi.rows, recommendedEventi:recommendedEventi.rows, lokacije: lokacijeResult.rows,
            tipovi: tipoviResult.rows})
    }catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post("/prijava-na-event/:id", async (req, res)=>{

    const idKorisnika=req.session.userId;
    const {id}=req.params;
    try {
        pool.query("insert into prijavljeni_korisnici (id_korisnika, id_eventa, status) values ($1,$2,$3)", [idKorisnika, id, "u obradi"])
        res.redirect("/korisnik/feed")
        } catch (err){
            console.error(err);
            res.status(500).send('Server error');
    }

})

router.post("/rezultati-searcha", async (req, res)=>{


    const {kljucnaRijec}=req.body;
    //console.log(kljucnaRijec)
    try {
        const lokacije= await pool.query("select * from lokacija where naziv like $1 or ulica like $1 or grad like $1 ", [kljucnaRijec+ '%'])
        console.log(lokacije.rows)
        const korisnici = await pool.query("select id, ime, prezime, korisnicko_ime from korisnik where (ime like $1 or prezime like $1 or korisnicko_ime like $1) and uloga=$2 ",[kljucnaRijec+'%', "organizer"])
        console.log(korisnici.rows)
        const eventi =await pool.query("select * from event where naziv like $1 ", [kljucnaRijec+'%'])
        console.log(eventi.rows)
        res.render("rezultati-searcha", {lokacije:lokacije.rows, korisnici:korisnici.rows, eventi:eventi.rows})

    }catch(err){
        console.error(err);
        res.status(500).send('Server error');
    }


})

router.get("/moji-eventi", async (req, res) => {


    const id=req.session.userId
    try{
        const eventi= await pool.query('select upit.id as id,  upit.naziv as naziv, upit.opis as opis, upit.datum as datum, upit.cijena as cijena, upit.status as status, upit.tip as tip,' +
            'pk.status as status from prijavljeni_korisnici as pk inner join (select upit.id as id,  upit.naziv as naziv, upit.opis as opis, upit.datum as datum, upit.cijena as cijena, upit.status as status, upit.tip as tip,' +
            '  lokacija.naziv || \', \' || lokacija.grad || \', \' || lokacija.ulica AS mjesto' +
            '  from lokacija inner join ' +
            '(SELECT event.id as id, event.id_lokacije as id_lokacije, event.naziv as naziv, event.opis as opis, event.datum as datum, event.cijena as cijena, event.status as status, tip_eventa.naziv_tipa as tip ' +
            'FROM event INNER JOIN tip_eventa ON event.id_tipa = tip_eventa.id) as upit on upit.id_lokacije=lokacija.id order by upit.datum asc) as upit on pk.id_eventa=upit.id where pk.id_korisnika=$1', [id]);
            res.render("moji-eventi", {mojiEventi:eventi.rows} )

    }catch(err){
        console.error(err);
        res.status(500).send('Server error');


    }

})
router.post("/otkazi-prijavu/:id", async (req, res)=>{


    const idKorisnika=req.session.userId
    const {id}=req.params
    try{
        await pool.query("delete from prijavljeni_korisnici where id_eventa=$1 and id_korisnika=$2 ", [id, idKorisnika])
        res.redirect("/korisnik/moji-eventi")
    }catch(err){
        console.error(err);
        res.status(500).send('Server error');


    }
})

router.get('/lokacija/eventi/:id', async (req, res) => {


    try {
        const { id } = req.params;
        const lokacijaResult = await pool.query('SELECT * FROM lokacija WHERE id = $1', [id]);
        const lokacija = lokacijaResult.rows[0];
        const eventiResult = await pool.query('SELECT * FROM event WHERE id_lokacije = $1', [id]);
        const eventi = eventiResult.rows;
        res.render('lokacija-eventi', { lokacija, eventi });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


router.get('/eventi/:id', async (req, res) => {


    try {
        const { id } = req.params;
        const korisnikResult = await pool.query('SELECT * FROM korisnik WHERE id = $1', [id]);
        const korisnik = korisnikResult.rows[0];
        const eventiResult = await pool.query('SELECT * FROM event WHERE id_organizatora = $1', [id]);
        const eventi = eventiResult.rows;
        res.render('organizator-eventi', { korisnik, eventi });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post("/ocijeni-event",  async ( req, res)=> {
    const {eventId, rating, comment}=req.body;

    const korisnikId=req.session.userId;
    try{await pool.query("insert into recenzija (recenzija, komentar, id_eventa, id_korisnika) " +
        "values ($1, $2, $3, $4)", [rating, comment, eventId, korisnikId])
        res.redirect("/korisnik/moji-eventi")
    }
    catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }

})
router.get("/prijateljstva", async (req, res)=>{
    const id=req.session.userId;
    try{
        const prijatelji=await pool.query("select id, ime, prezime, korisnicko_ime from korisnik where id in " +
            "(select id_prijatelja2 from prijatelji where status=$1 and id_prijatelja1=$2)", ["odobren", id]);
        const potencijalni_prijatelji=await pool.query("select id, ime, prezime, korisnicko_ime from korisnik where id not in" +
            "(select id_prijatelja2 from prijatelji where (status=$1 or status =$3) and id_prijatelja1=$2) order by RANDOM() LIMIT 5", ["odobren", id, "u obradi"]);
        const zahtjevi_za_prijateljstvo=await pool.query("select id, ime, prezime, korisnicko_ime from korisnik where id in" +
            "(select id_prijatelja1 from prijatelji where status=$1 and id_prijatelja2=$2)", ["u obradi", id])
        res.render("prijatelji", {prijatelji:prijatelji.rows, potencijalni_prijatelji:potencijalni_prijatelji.rows, zahtjevi_za_prijateljstvo:zahtjevi_za_prijateljstvo.rows})

    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }


})
router.post("/dodaj-prijatelja/:id", async (req, res)=>{
    const id_korisnika=req.session.userId;
    const {id}=req.params
    try{
        await pool.query("insert into prijatelji (id_prijatelja1, id_prijatelja2, status) values ($1,$2,$3)", [id_korisnika, id, "u obradi"])
        res.redirect("/korisnik/prijateljstva")
    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }

})

router.post("/prihvati-prijatelja/:id", async (req, res)=>{
    const id_korisnika=req.session.userId;
    const {id}=req.params
    try{
        await pool.query("insert into prijatelji (id_prijatelja1, id_prijatelja2, status) values ($1,$2,$3)", [ id_korisnika, id, "odobren"])
        await pool.query("update prijatelji set status=$1 where id_prijatelja1=$2 and id_prijatelja2=$3", ["odobren", id, id_korisnika])
        res.redirect("/korisnik/prijateljstva")
    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }

})

router.post("/odbij-prijatelja/:id", async (req, res)=>{
    const id_korisnika=req.session.userId;
    const {id}=req.params
    try{
        await pool.query("delete from prijatelji where id_prijatelja1=$1 and id_prijatelja2=$2", [id, id_korisnika])
        res.redirect("/korisnik/prijateljstva")


    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }

})

router.post("/obrisi-prijatelja/:id", async (req, res)=>{
    const id_korisnika=req.session.userId;
    const {id}=req.params
    try{
        await pool.query("delete from prijatelji where id_prijatelja1=$1 and id_prijatelja2=$2", [id, id_korisnika])
        await pool.query("delete from prijatelji where id_prijatelja1=$2 and id_prijatelja2=$1", [id, id_korisnika])
        res.redirect("/korisnik/prijateljstva")


    }catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }

})


module.exports = router;
