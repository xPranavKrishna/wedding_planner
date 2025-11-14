const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const ejs = require('ejs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'rootSQL@2003',
  database: 'weddingplan'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to database');
});

// Login and signup route
app.post('/auth', async (req, res) => {
  const { username, password } = req.body;
  const queryCheckUser = 'SELECT * FROM users WHERE username = ?';
  db.query(queryCheckUser, [username], async (err, results) => {
    if (err) return res.status(500).send('Database error');

    if (results.length > 0) {
      const user = results[0];
      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (isPasswordMatch) {
        req.session.userId = user.id;
        res.redirect('/home');
      } else {
        res.status(401).send('Incorrect password');
      }
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const queryCreateUser = 'INSERT INTO users (username, password) VALUES (?, ?)';
      db.query(queryCreateUser, [username, hashedPassword], (err, result) => {
        if (err) return res.status(500).send('Database error');
        req.session.userId = result.insertId;
        res.redirect('/home');
      });
    }
  });
});

// Submit form route
app.post('/submit-form', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send('User not logged in');
  const {
    brideName, groomName, contactEmail, contactPhone,
    weddingDate, guestCount, venueName, venueLocation,
    budget, notes, photography_videography, catering, makeup_styling
  } = req.body;

  try {
    await db.promise().query(
      'INSERT INTO couple_details (user_id, bride_name, groom_name, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?)',
      [userId, brideName, groomName, contactEmail, contactPhone]
    );
    await db.promise().query(
      'INSERT INTO event_details (user_id, wedding_date, guest_count, venue_name, venue_location) VALUES (?, ?, ?, ?, ?)',
      [userId, weddingDate, guestCount, venueName, venueLocation]
    );
    await db.promise().query(
      'INSERT INTO services (user_id, photography_videography, catering, makeup_styling, additional_notes) VALUES (?, ?, ?, ?, ?)',
      [userId, photography_videography, catering, makeup_styling, notes]
    );
    await db.promise().query(
      'INSERT INTO budget_details (user_id, budget, notes) VALUES (?, ?, ?)',
      [userId, budget, notes]
    );
    res.redirect('/home');
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});

// Display home page route
app.get('/home', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send('User not logged in');
  
  try {
    const [eventDetails] = await db.promise().query(
      `SELECT event_details.wedding_date, event_details.guest_count, event_details.venue_name, 
              event_details.venue_location, services.photography_videography, services.catering, 
              services.makeup_styling, budget_details.budget, event_details.status 
       FROM event_details 
       LEFT JOIN services ON event_details.user_id = services.user_id 
       LEFT JOIN budget_details ON event_details.user_id = budget_details.user_id 
       WHERE event_details.user_id = ?`, [userId]);

    const [coupleDetails] = await db.promise().query(
      `SELECT bride_name, groom_name 
       FROM couple_details 
       WHERE user_id = ?`, [userId]);

    if (eventDetails.length === 0) {
      return res.render('home', { hasEvent: false, brideName: null, groomName: null });
    }

    const weddingDate = new Date(eventDetails[0].wedding_date);
    const formattedDate = weddingDate.toLocaleDateString('en-GB', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
    const formattedBudget = `₹${eventDetails[0].budget.toLocaleString('en-IN')}`;

    res.render('home', {
      hasEvent: true,
      weddingDate: formattedDate,
      guestCount: eventDetails[0].guest_count,
      venueName: eventDetails[0].venue_name,
      venueLocation: eventDetails[0].venue_location,
      photography: eventDetails[0].photography_videography,
      catering: eventDetails[0].catering,
      makeup: eventDetails[0].makeup_styling,
      budget: formattedBudget,
      eventStatus: eventDetails[0].status,
      brideName: coupleDetails[0]?.bride_name || null,
      groomName: coupleDetails[0]?.groom_name || null
    });
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});


// Route to cancel event
app.post('/cancel-event', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send('User not logged in');

  const deleteQueries = [
    'DELETE FROM couple_details WHERE user_id = ?',
    'DELETE FROM event_details WHERE user_id = ?',
    'DELETE FROM services WHERE user_id = ?',
    'DELETE FROM budget_details WHERE user_id = ?'
  ];

  let deleteCount = 0;
  deleteQueries.forEach((query) => {
    db.query(query, [userId], (err) => {
      if (err) return res.status(500).send('Error canceling event.');
      deleteCount++;
      if (deleteCount === deleteQueries.length) res.redirect('/home'); // Success after all deletions
    });
  });
});


// Route to confirm payment
// Route to book event (payment page with budget details)
app.get('/book-event', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send('User not logged in');

  try {
    const [budgetDetails] = await db.promise().query(
      'SELECT budget FROM budget_details WHERE user_id = ?',
      [userId]
    );

    if (budgetDetails.length === 0) {
      return res.status(404).send('Budget details not found');
    }

    const budget = budgetDetails[0].budget;
    res.render('payment', { budget }); // Pass budget to payment.ejs
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }

  
// Route to book event (payment page)
  app.get('/book-event', (req, res) => {
  res.render('payment');  // Render payment page 
});
});
app.post('/confirm-payment', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).send('User not logged in');

  try {
    // Update the event status to "Paid" in the database
    await db.promise().query(
      'UPDATE event_details SET status = "Paid" WHERE user_id = ?',
      [userId]
    );

    // Redirect to the home page to show updated status
    res.redirect('/home');
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});

// Route to display admin page with details of all users
app.get('/admin', async (req, res) => {
  try {
    const [users] = await db.promise().query(`
      SELECT users.id, users.username,
             couple_details.bride_name, couple_details.groom_name, couple_details.contact_email, couple_details.contact_phone,
             event_details.wedding_date, event_details.guest_count, event_details.venue_name, event_details.venue_location, event_details.status,
             services.photography_videography, services.catering, services.makeup_styling,
             budget_details.budget, budget_details.notes AS budget_notes
      FROM users
      LEFT JOIN couple_details ON users.id = couple_details.user_id
      LEFT JOIN event_details ON users.id = event_details.user_id
      LEFT JOIN services ON users.id = services.user_id
      LEFT JOIN budget_details ON users.id = budget_details.user_id
    `);

    res.render('admin', { users });
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});



const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


