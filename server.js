const express = require('express');
const path = require('path');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { connectToMongoDB, getDB } = require('./mongodb');
const { ObjectId } = require('mongodb');

const app = express();

// Middleware for parsing incoming request bodies
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// Session setup
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
}));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// MySQL Database Connection
const pool = mysql.createPool({
    connectionLimit: 10,
    host: 'inf2003db-felixchang-67bf.g.aivencloud.com',
    port: '26780',
    user: 'web',
    password: 'web',
    database: 'test'
});

// Check MySQL Database Connection
pool.getConnection((error) => {
    if (error) throw error;
    console.log('MySQL Database is connected successfully');
});

// Connect to MongoDB and Check Connection
connectToMongoDB();

// Middleware to log SQL queries
function logSqlQueries(req, res, next) {
    req.queryLogs = []; // Initialize an empty array to store query logs

    req.logQuery = (sql, values) => {
        const start = process.hrtime();
        pool.query(sql, values, (error, results) => {
            const elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get milliseconds
            const queryInfo = {
                sql: sql,
                values: values,
                executionTime: elapsed.toFixed(2) + ' ms',
                error: error ? error.message : null
            };
            req.queryLogs.push(queryInfo); // Store query info in request object
            console.log('SQL Query:', queryInfo);
            if (error) {
                console.error('SQL Error:', error);
            }
        });
    };
    next();
}

// Adding the middleware to log SQL queries
// Apply the middleware only to the routes that need SQL logging
app.use('/get_platforms', logSqlQueries);
app.use('/get_publishers', logSqlQueries);
app.use('/get_genres', logSqlQueries);
app.use('/register', logSqlQueries);
app.use('/login', logSqlQueries);
app.use('/edit_game', logSqlQueries);
app.use('/get_games', logSqlQueries);
app.use('/get_games_f', logSqlQueries);
app.use('/open_game', logSqlQueries);

// Function to check if a string is a valid ObjectId
function isValidObjectId(id) {
    return ObjectId.isValid(id) && (String(new ObjectId(id)) === id);
}

//--Routes--//
// Redirect to register page on first launch
app.get("/", (request, response) => {
    if (request.session.loggedin) {
        response.redirect("/index");
    } else {
        response.redirect("/frontpage");
    }
});

// Serve as main page
app.get("/frontpage", (request, response) => {
    response.sendFile(__dirname + "/frontpage.html");
});

// Serve registration page
app.get("/register", (request, response) => {
    response.sendFile(__dirname + "/register.html");
});

// Serve login page
app.get("/login", (request, response) => {
    response.sendFile(__dirname + "/login.html");
});

// Serve as admin login page
app.get("/admin", (request, response) => {
    response.sendFile(__dirname + "/admin.html");
});

// Serve as admin dashboard
app.get("/admindash", isAdmin, (req, res) => {
    res.sendFile(__dirname + "/admindash.html");
});

app.get("/gameadd", isAdmin, (req, res) => {
    res.sendFile(__dirname + "/add_game.html");
});

app.get("/gamedelete", isAdmin, (req, res) => {
    res.sendFile(__dirname + "/delete_game.html");
});

app.get("/modify", isAdmin, (req, res) => {
    res.sendFile(__dirname + "/modify_game.html");
});

// Serve as game info page
app.get("/game_info", (request, response) => {
    response.sendFile(__dirname + "/game_info.html");
});

// Endpoint to fetch SQL performance data
app.get('/performance', (req, res) => {
    const performanceData = req.queryLogs;
    res.json(performanceData);
});

// Serve index page
app.get("/index", (request, response) => {
    if (request.session.loggedin) {
        response.sendFile(__dirname + "/index2.html");
    } else {
        response.redirect("/login");
    }
});

//Serve bookmark page
app.get('/bookmarks', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login'); // Redirect to login page if not authenticated
    }
    res.sendFile(__dirname + '/bookmarks.html');
});

// Route to get platforms
app.get("/get_platforms", (req, res) => {
    const sql = "SELECT DISTINCT platform FROM games";
    req.logQuery(sql); // Logging the SQL query
    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching platforms:', error);
            res.status(500).json({ error: 'Error fetching platforms' });
        } else {
            const platforms = results.map(result => result.platform);
            res.json(platforms);
        }
    });
});

// Route to get publishers
app.get("/get_publishers", (req, res) => {
    const sql = "SELECT * FROM publishers";
    req.logQuery(sql); // Logging the SQL query
    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching publishers:', error);
            res.status(500).json({ error: 'Error fetching publishers' });
        } else {
            res.json(results);
        }
    });
});

// Route to get genres
app.get("/get_genres", (req, res) => {
    const sql = "SELECT * FROM genres";
    req.logQuery(sql); // Logging the SQL query
    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching genres:', error);
            res.status(500).json({ error: 'Error fetching genres' });
        } else {
            res.json(results);
        }
    });
});

// Register Route
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).json({ success: false, message: 'Registration failed' });
        }

        const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
        req.logQuery(sql, [username, hash]); // Logging the SQL query
        pool.query(sql, [username, hash], (error, results) => {
            if (error) {
                console.error('Error inserting user:', error);
                if (error.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ success: false, message: 'Username already exists. Please try to login instead.' });
                }
                return res.status(500).json({ success: false, message: 'Registration failed' });
            }
            res.json({ success: true, message: 'Registration successful' });
        });
    });
});


// Login Route
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const sql = 'SELECT * FROM users WHERE username = ?';
    req.logQuery(sql, [username]); // Logging the SQL query
    pool.query(sql, [username], (error, results) => {
        if (error) {
            console.error('Error fetching user:', error);
            return res.status(500).json({ success: false, message: 'Login failed' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.status(500).json({ success: false, message: 'Login failed' });
            }

            if (isMatch) {
                req.session.loggedin = true;
                req.session.username = username;
                req.session.user_id = user.id;
                res.json({ success: true, message: 'Login successful' });
            } else {
                res.json({ success: false, message: 'Password incorrect' });
            }
        });
    });
});

// Admin Login Route
app.post('/admin-login', (req, res) => {
    const { username, password } = req.body;

    const adminUsername = 'admin'; // Default admin username
    const adminPassword = 'admin'; // Default admin password

    if (username === adminUsername && password === adminPassword) {
        req.session.loggedin = true;
        req.session.isAdmin = true; // Mark session as admin
        res.json({ success: true, message: 'Admin login successful' });
    } else {
        res.json({ success: false, message: 'Invalid username or password' });
    }
});


function isAdmin(req, res, next) {
    if (req.session.loggedin && req.session.isAdmin) {
        next(); // Proceed to the next middleware or route handler
    } else {
        res.redirect('/admin');
    }
}

// Logout Route
app.post('/logout', (req, res) => {
    console.log('Logout request received');
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.json({ success: false, message: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logout successful' });
    });
});

// Check login status
app.get('/check-login-status', (req, res) => {
    if (req.session.loggedin) {
        res.json({ isLoggedIn: true });
    } else {
        res.json({ isLoggedIn: false });
    }
});

// Route to add game details
app.post('/gameadd', isAdmin, (req, res) => {
    const { name, year, platform, publisher, genre, na_sales, eu_sales, jp_sales, other_sales } = req.body;

    // Construct the SQL query to check for duplicates
    const sqlCheckDuplicate = `
        SELECT *
        FROM games
        WHERE name = ? AND year = ? AND platform = ? AND publisher_id = ? AND genre_id = ?
          AND na_sales = ? AND eu_sales = ? AND jp_sales = ? AND other_sales = ?
    `;

    // Execute the query to check for duplicates
    pool.query(sqlCheckDuplicate, [name, year, platform, publisher, genre, na_sales, eu_sales, jp_sales, other_sales], (error, results) => {
        if (error) {
            console.error('Error checking duplicate game:', error);
            return res.json({ success: false, message: 'Failed to add game' });
        }

        // If a game with the same details already exists, return an error
        if (results.length > 0) {
            return res.json({ success: false, message: 'A game with the same details already exists' });
        }

        // If no duplicate is found, proceed to insert the game into the database
        const sqlInsertGame = `
            INSERT INTO games (name, year, platform, publisher_id, genre_id, na_sales, eu_sales, jp_sales, other_sales, global_sales)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // Calculate global sales (sum of regional sales)
        const global_sales = parseFloat(na_sales) + parseFloat(eu_sales) + parseFloat(jp_sales) + parseFloat(other_sales);

        // Execute the insert query
        pool.query(sqlInsertGame, [name, year, platform, publisher, genre, na_sales, eu_sales, jp_sales, other_sales, global_sales], (error, results) => {
            if (error) {
                console.error('Error adding game:', error);
                return res.json({ success: false, message: 'Failed to add game' });
            }
            res.json({ success: true, message: 'Game added successfully' });
        });
    });
});


// POST route to edit game details
app.post("/edit_game", (request, response) => {
    const { gameId, name, year, platform_Name, publisher_id, genre_id } = request.body;

    const sql = `UPDATE games
                 SET name = ?, year = ?, platform = ?, publisher_id = ?, genre_id = ?
                 WHERE game_id = ?`;
    request.logQuery(sql, [name, year, platform_Name, publisher_id, genre_id, gameId]); // Logging the SQL query
    pool.query(sql, [name, year, platform_Name, publisher_id, genre_id, gameId], (error, results) => {
        if (error) {
            console.error("Error updating game details:", error);
            response.status(500).json({ message: "Failed to update game details" });
        } else {
            response.status(200).json({ message: "Game details updated successfully" });
        }
    });
});

// Route to get games based on search
app.get("/get_games", (request, response) => {
    const sql = "SELECT games.*, genres.genre_name FROM games JOIN genres ON games.genre_id = genres.genre_id WHERE games.name LIKE '%" + request.query.search + "%'";;
    request.logQuery(sql); // Logging the SQL query
    pool.query(sql, (error, results) => {
        if (error) {
            console.error("Error fetching games:", error);
            response.status(500).json({ message: "Failed to fetch games" });
        } else {
            response.send(results);
        }
    });
});

// Define a new route that accepts a filter parameter
app.get('/get_games_f', (req, res) => {
    // Get the filter parameter from the request query
    const filter = req.query.filter;
    const platform = req.query.platform;
    const genre = req.query.genre;
    const search = req.query.search;

    let query = 'SELECT games.*, genres.genre_name FROM games JOIN genres ON games.genre_id = genres.genre_id WHERE 1=1';

    if (platform !== 'ALL') {
        query += ` AND games.platform = '${platform}'`;
    }
    if (genre !== 'ALL') {
        query += ` AND genres.genre_name = '${genre}'`;
    }
    if (search) {
        query += ` AND games.name LIKE '%${search}%'`;
    }
    if (filter === 'top10') {
        query += ' ORDER BY games.game_id LIMIT 10';
    }

    req.logQuery(query); // Logging the SQL query
    pool.query(query, (error, results) => {
        if (error) {
            console.error("Error fetching filtered games:", error);
            res.status(500).json({ message: "Failed to fetch filtered games" });
        } else {
            res.send(results);
        }
    });
});

// Route to get game details
app.get("/open_game", (request, response) => {
    const sql = `SELECT g.game_id, g.name, g.year, g.platform, p.publisher_name as publisher, g2.genre_name as genre
        FROM games g, publishers p, genres g2
        WHERE g.publisher_id = p.publisher_id
        AND g.genre_id = g2.genre_id
        AND g.game_id = ?`;

    request.logQuery(sql, [request.query.id]); // Logging the SQL query
    pool.query(sql, [request.query.id], (error, results) => {
        if (error) {
            console.error("Error fetching game details:", error);
            response.status(500).json({ message: "Failed to fetch game details" });
        } else {
            response.send(results);
        }
    });
});

// // Route to retrieve reviews for a game
// app.get("/get_reviews", async (request, response) => {
//     const gameId = request.query.gameid;
//     const sql = "SELECT r.review_id, r.rating, r.comment, DATE_FORMAT(r.date, '%Y-%m-%d') as date, u.username, r.user_id FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.game_id = ?";

//     pool.query(sql, [gameId], async (error, results) => {
//         if (error) {
//             console.error('Error fetching reviews:', error);
//             return response.status(500).json({ message: 'Failed to fetch reviews' });
//         }

//         try {
//             const db = getDB();
//             const imagesCollection = db.collection('review_images');
//             const reviewsWithImages = await Promise.all(results.map(async (review) => {
//                 let imageBase64 = null;
//                 try {
//                     const reviewIdStr = review.review_id.toString().padStart(24, '0'); // Ensure it's 24 characters long
//                     if (isValidObjectId(reviewIdStr)) {
//                         const image = await imagesCollection.findOne({ review_id: new ObjectId(reviewIdStr) });
//                         if (image) {
//                             imageBase64 = image.image_base64;
//                         }
//                     }
//                 } catch (imageError) {
//                     console.error('Error fetching image for review:', review.review_id, imageError);
//                 }
//                 return {
//                     ...review,
//                     image_base64: imageBase64
//                 };
//             }));
//             response.send(reviewsWithImages);
//         } catch (error) {
//             console.error('Error fetching review images:', error);
//             response.status(500).json({ message: 'Failed to fetch review images' });
//         }
//     });
// });

// Route to retrieve reviews for a game
app.get("/get_reviews", async (request, response) => {
    const gameId = request.query.gameid;
    const sql = "SELECT r.review_id, r.rating, r.comment, DATE_FORMAT(r.date, '%Y-%m-%d') as date, u.username, r.user_id FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.game_id = ?";

    pool.query(sql, [gameId], async (error, results) => {
        if (error) {
            console.error('Error fetching reviews:', error);
            return response.status(500).json({ message: 'Failed to fetch reviews' });
        }

        try {
            const db = getDB();
            const imagesCollection = db.collection('review_images');
            const reviewLikesCollection = db.collection('review_likes');
            const repliesCollection = db.collection('replies');

            const reviewsWithImagesLikesAndComments = await Promise.all(results.map(async (review) => {
                let imageBase64 = null;
                let likes = 0;
                let comments = [];
                try {
                    // Fetch image from MongoDB
                    const reviewIdStr = review.review_id.toString().padStart(24, '0'); // Ensure it's 24 characters long
                    if (isValidObjectId(reviewIdStr)) {
                        const image = await imagesCollection.findOne({ review_id: new ObjectId(reviewIdStr) });
                        if (image) {
                            imageBase64 = image.image_base64;
                        }
                    }

                    // Fetch like count from MongoDB
                    const likeDoc = await reviewLikesCollection.findOne({ reviewId: review.review_id });
                    if (likeDoc) {
                        likes = likeDoc.likes;
                    }

                    // Fetch comments from MongoDB
                    const rawComments = await repliesCollection.find({ reviewId: review.review_id }).project({ text: 1, userId: 1, _id: 0 }).toArray();

                    // Fetch usernames for each comment from MySQL
                    comments = await Promise.all(rawComments.map(async (comment) => {
                        return new Promise((resolve, reject) => {
                            const userSql = 'SELECT username FROM users WHERE id = ?';
                            pool.query(userSql, [comment.userId], (err, userResult) => {
                                if (err) {
                                    console.error('Error fetching username:', err);
                                    return reject(err);
                                }
                                resolve({
                                    ...comment,
                                    username: userResult[0].username
                                });
                            });
                        });
                    }));
                } catch (error) {
                    console.error('Error fetching data for review:', review.review_id, error);
                }

                return {
                    ...review,
                    image_base64: imageBase64,
                    likes: likes,
                    comments: comments
                };
            }));
            response.send(reviewsWithImagesLikesAndComments);
        } catch (error) {
            console.error('Error fetching review images, likes, and comments:', error);
            response.status(500).json({ message: 'Failed to fetch review images, likes, and comments' });
        }
    });
});

// Route to submit a new review
app.post("/add_review", (request, response) => {
    const { game_id, rating, comment, image_base64 } = request.body;
    const user_id = request.session.user_id; // assuming user_id is stored in session after login

    // Convert current time to Singapore time
    const currentUTC = new Date();
    const singaporeOffset = 8 * 60; // Singapore is UTC+8
    const singaporeTime = new Date(currentUTC.getTime() + (singaporeOffset * 60 * 1000));
    const date = singaporeTime.toISOString().split('T')[0]; // get current date in YYYY-MM-DD format
    const sql = "INSERT INTO reviews (user_id, game_id, rating, comment, date) VALUES (?, ?, ?, ?, ?)";

    pool.query(sql, [user_id, game_id, rating, comment, date], async (error, results) => {
        if (error) {
            console.error('Error adding review:', error);
            return response.status(500).json({ message: 'Failed to add review' });
        }

        if (image_base64) {
            const review_id = results.insertId.toString().padStart(24, '0'); // Ensure it's 24 characters long
            const newImage = {
                review_id: new ObjectId(review_id),
                image_base64,
            };

            try {
                const db = getDB();
                const imagesCollection = db.collection('review_images');
                await imagesCollection.insertOne(newImage);
                response.json({ success: true, message: 'Review and image added successfully' });
            } catch (error) {
                console.error('Error adding image to review:', error);
                response.status(500).json({ message: 'Review added but failed to add image' });
            }
        } else {
            response.json({ success: true, message: 'Review added successfully' });
        }
    });
});

// POST route to remove a review
app.post('/delete_review', async (req, res) => {
    const reviewId = req.body.reviewId;
    const username = req.session.username;
    const reviewUsername = req.body.reviewUsername;
    const isAdmin = req.session.isAdmin; // Check if the user is an admin

    const reviewIdStr = reviewId.toString().padStart(24, '0');
    if (!isValidObjectId(reviewIdStr)) {
        return res.status(400).json({ message: 'Invalid review ID format' });
    }

    try {
        if (isAdmin || username === reviewUsername) {
            await pool.query('DELETE FROM reviews WHERE review_id = ?', [reviewId]);
            const db = getDB();
            const imagesCollection = db.collection('review_images');
            const reviewLikesCollection = db.collection('review_likes');
            const userLikesCollection = db.collection('user_likes');

            await imagesCollection.deleteOne({ review_id: new ObjectId(reviewIdStr) });
            await reviewLikesCollection.deleteOne({ reviewId: reviewId });
            await userLikesCollection.deleteMany({ reviewId: reviewId });

            res.status(200).json({ message: 'Review deleted successfully' });
        } else {
            res.status(403).json({ message: 'You have no rights to delete this review' });
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST route to delete a game
app.post('/delete_game', async (req, res) => {
    const gameId = req.body.gameId;

    try {
        // Delete the game and associated reviews
        const deleteQuery = `
            DELETE games, reviews FROM games
            LEFT JOIN reviews ON games.game_id = reviews.game_id
            WHERE games.game_id = ?;
        `;
        await pool.query(deleteQuery, [gameId]);

        res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('Error deleting game and reviews:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to like a review
app.post('/like_review', async (req, res) => {
    const { reviewId } = req.body;
    const userId = req.session.user_id; // assuming user_id is stored in session after login

    try {
        const db = getDB();
        const reviewLikesCollection = db.collection('review_likes');
        const userLikesCollection = db.collection('user_likes');

        // Check if the user has already liked the review
        const existingLike = await userLikesCollection.findOne({ userId: userId, reviewId: reviewId });

        if (existingLike) {
            return res.status(400).json({ success: false, message: 'You have already liked this review' });
        }

        // Increment the like count in the reviewLikes collection
        const result = await reviewLikesCollection.updateOne(
            { reviewId: reviewId },
            { $inc: { likes: 1 } },
            { upsert: true }
        );

        if (result.matchedCount === 0 && result.upsertedCount === 0) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Add a record to the userLikes collection
        await userLikesCollection.insertOne({ userId: userId, reviewId: reviewId });

        res.status(200).json({ success: true, message: 'Review liked successfully' });
    } catch (error) {
        console.error('Error liking review:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to add a comment to a review
app.post('/add_comment', async (req, res) => {
    const { reviewId, comment } = req.body;
    const userId = req.session.user_id; // assuming user_id is stored in session after login

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User is not logged in' });
    }

    try {
        const db = getDB();
        const repliesCollection = db.collection('replies');

        const newComment = {
            reviewId: parseInt(reviewId, 10), // Ensure reviewId is an integer
            userId: userId,
            text: comment,
            date: new Date()
        };

        await repliesCollection.insertOne(newComment);

        res.status(200).json({ success: true, message: 'Comment added successfully', username: req.session.username });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: 'Failed to add comment' });
    }
});


// Update the get_reviews route to include comments
app.get("/get_reviews", async (request, response) => {
    const gameId = request.query.gameid;
    const sql = "SELECT r.review_id, r.rating, r.comment, DATE_FORMAT(r.date, '%Y-%m-%d') as date, u.username, r.user_id FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.game_id = ?";

    pool.query(sql, [gameId], async (error, results) => {
        if (error) {
            console.error('Error fetching reviews:', error);
            return response.status(500).json({ message: 'Failed to fetch reviews' });
        }

        try {
            const db = getDB();
            const imagesCollection = db.collection('review_images');
            const reviewLikesCollection = db.collection('review_likes');
            const repliesCollection = db.collection('replies');

            const reviewsWithImagesAndLikes = await Promise.all(results.map(async (review) => {
                let imageBase64 = null;
                let likes = 0;
                let comments = [];
                try {
                    // Fetch image from MongoDB
                    const reviewIdStr = review.review_id.toString().padStart(24, '0'); // Ensure it's 24 characters long
                    if (isValidObjectId(reviewIdStr)) {
                        const image = await imagesCollection.findOne({ review_id: new ObjectId(reviewIdStr) });
                        if (image) {
                            imageBase64 = image.image_base64;
                        }
                    }

                    // Fetch like count from MongoDB
                    const likeDoc = await reviewLikesCollection.findOne({ reviewId: review.review_id });
                    if (likeDoc) {
                        likes = likeDoc.likes;
                    }

                    // Fetch comments from MongoDB
                    comments = await repliesCollection.find({ reviewId: new ObjectId(reviewIdStr) }).toArray();
                } catch (error) {
                    console.error('Error fetching data for review:', review.review_id, error);
                }

                return {
                    ...review,
                    image_base64: imageBase64,
                    likes: likes,
                    comments: comments
                };
            }));
            response.send(reviewsWithImagesAndLikes);
        } catch (error) {
            console.error('Error fetching review images, likes, and comments:', error);
            response.status(500).json({ message: 'Failed to fetch review images, likes, and comments' });
        }
    });
});

app.post('/save_bookmark', async (req, res) => {
    const db = getDB();
    try {
        const { gameid } = req.body; // Ensure this matches the request payload
        const username = req.session.username;
        const user_id = req.session.user_id;

        console.log('Received data:', { gameId: gameid, user_id }); // Add this line to debug

        if (!username) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        let bookmarkId;
        if (ObjectId.isValid(gameid)) {
            bookmarkId = new ObjectId(gameid);
        } else {
            bookmarkId = gameid; // Use the gameid as is if it's not a valid ObjectId
        }

        const bookmarksCollection = db.collection('bookmark');
        const result = await bookmarksCollection.updateOne(
            { user_id: user_id },
            { $addToSet: { bookmarks: bookmarkId } }, // Use the appropriate bookmarkId
            { upsert: true }
        );

        res.json({ success: true, message: 'Game bookmarked successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/*app.get('/get_bookmarks', async (req, res) => {
    const db = getDB();
    try {
        const username = req.session.username;

        if (!username) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const bookmarksCollection = db.collection('bookmark');
        const userBookmarks = await bookmarksCollection.findOne({ username: username });

        if (!userBookmarks) {
            return res.json({ success: true, bookmarks: [] });
        }

        res.json({ success: true, bookmarks: userBookmarks.bookmarks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}); */

app.get('/get_bookmarks', async (req, res) => {
    const db = getDB();
    try {
        //const username = req.session.username;
        const user_id = req.session.user_id;

        if (!user_id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const bookmarksCollection = db.collection('bookmark');
        const userBookmarks = await bookmarksCollection.findOne({ user_id: user_id });

        if (!userBookmarks) {
            return res.json({ success: true, bookmarks: [] });
        }

        // Convert bookmarks to an array of game_ids
        const gameIds = userBookmarks.bookmarks;

        // Query MySQL to get game names
        const sql = 'SELECT game_id, name FROM games WHERE game_id IN (?)';
        pool.query(sql, [gameIds], (error, results) => {
            if (error) {
                console.error('Error fetching game names:', error);
                return res.status(500).json({ success: false, message: 'Internal Server Error' });
            }

            // Map game_id to game_name
            const bookmarksWithNames = results.map(game => ({
                game_id: game.game_id,
                name: game.name
            }));

            res.json({ success: true, bookmarks: bookmarksWithNames });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Endpoint to remove a bookmark
app.post('/remove_bookmark', async (req, res) => {
    const db = getDB();
    try {
        const { gameid } = req.body;
        //const username = req.session.username;
        const user_id = req.session.user_id;

        if (!user_id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        let bookmarkId;
        if (ObjectId.isValid(gameid)) {
            bookmarkId = new ObjectId(gameid);
        } else {
            bookmarkId = gameid; // Use the gameid as is if it's not a valid ObjectId
        }

        const bookmarksCollection = db.collection('bookmark');
        const result = await bookmarksCollection.updateOne(
            { user_id: user_id },
            { $pull: { bookmarks: bookmarkId } } // Remove the bookmark
        );

        res.json({ success: true, message: 'Game removed from bookmarks successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.get('/check_bookmark', async (req, res) => {
    const db = getDB();
    try {
        const { gameid } = req.query;
        //const username = req.session.username;
        const user_id = req.session.user_id;

        if (!user_id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        let bookmarkId;
        if (ObjectId.isValid(gameid)) {
            bookmarkId = new ObjectId(gameid);
        } else {
            bookmarkId = gameid; // Use the gameid as is if it's not a valid ObjectId
        }

        const bookmarksCollection = db.collection('bookmark');
        const userBookmarks = await bookmarksCollection.findOne(
            { user_id: user_id, bookmarks: bookmarkId },
            { projection: { _id: 0 } }
        );

        res.json({ isBookmarked: !!userBookmarks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.post('/save_filter', async (req, res) => {
    try {
        const { genre, platform } = req.body;

        if (!genre || !platform) {
            return res.status(400).json({ message: 'Genre and platform are required.' });
        }

        const db = getDB();
        const filtersCollection = db.collection('filters');

        // Increment the count for the filter
        await filtersCollection.updateOne(
            { genre, platform },
            { $inc: { count: 1 } },
            { upsert: true } // Create a new document if it doesn't exist
        );

        res.status(200).json({ message: 'Filter saved successfully.' });
    } catch (error) {
        console.error('Error saving filter:', error);
        res.status(500).json({ message: 'Error saving filter.' });
    }
});


app.get('/get_popular_filters', async (req, res) => {
    try {
        const db = getDB();
        const filtersCollection = db.collection('filters');
        

        // Retrieve the most popular platform
        const popularPlatform = await filtersCollection
            .find({ platform: { $ne: null } }) // Ensure platform is not null
            .sort({ count: -1 })
            .limit(1)
            .toArray();
                // Retrieve the most popular genre
                const popularGenre = await filtersCollection
                .find({ genre: { $ne: null } }) // Ensure genre is not null
                .sort({ count: -1 })
                .limit(1)
                .toArray();



        // Prepare the response with the most popular genre and platform
        res.status(200).json({
            genre: popularGenre.length ? popularGenre[0].genre : null,
            platform: popularPlatform.length ? popularPlatform[0].platform : null
        });
    } catch (error) {
        console.error('Error fetching popular filters:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// Start the server
app.listen(8080, () => {
    console.log('Server listening on port 8080');
});
