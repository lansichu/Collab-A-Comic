var express = require('express');
var passport = require('passport');
var app = require('../app.ts');
var Account = require('../models/account.ts');
var Comic = require('../models/comic.ts');
var router = express.Router();
var postmark = require("postmark");
var multer = require('multer');
var mongoose = require('mongoose');
//var db = app.mongoose.connection;
// Postmark config
var client = new postmark.Client("4ab236e2-b3e9-450c-bcdb-1ebed058ff7d");
/* GET home page. */
router.get('/', function (req, res) {
    if (req.user) {
        res.redirect('/homepage');
    }
    res.render('index', {
        user: req.user,
        title: "Collab-a-Comic!" });
});
/* GET registration page. */
router.get('/register', function (req, res) {
    res.render('register', {});
});
/* POST registration fields. */
router.post('/register', function (req, res) {
    Account.register(new Account({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        username: req.body.username,
        email: req.body.email,
        isContributor: req.body.isContributor
    }), req.body.password, function (err, account) {
        if (err) {
            return res.render('register', { account: account });
        }
        else {
            sendConfEmail(req, res);
        }
        passport.authenticate('local-login')(req, res, function () {
            res.redirect('/homepage');
        });
    });
});
///* GET toolbar. */
//// TODO: do we need this?
//router.get('/toolbar', function(req, res) {
//  res.render('toolbar')
//});
/* GET login page. */
router.get('/login', function (req, res) {
    res.render('login', { user: req.user });
});
/* POST login form */
router.post('/login', passport.authenticate('local-login', {
    successRedirect: '/homepage',
    failureRedirect: '/login'
}));
/* GET homepage. */
router.get('/homepage', isLoggedIn, function (req, res) {
    res.render('homepage', { user: req.user });
});
// Middleware for checking login state
function isLoggedIn(req, res, next) {
    if (req.user) {
        console.log("User is logged in");
        next();
    }
    else {
        console.log("User is NOT logged in");
        res.redirect('/login');
    }
}
/* Middleware for checking login and contributor status.
 Behavior: if false, do nothing.
 */
function isContributor(req, res, next) {
    if (req.user.isContributor == true) {
        console.log("User is contributor");
        next();
    }
    else {
        console.log("User is NOT contributor");
        res.redirect('/#');
    }
}
// GET logout
router.get('/logout', function (req, res) {
    console.log("LOGGING OUT");
    req.logout();
    res.render('index', {
        title: "Collab-a-Comic!",
        message: "You've been logged out!" });
});
// Middleware to send confirmation email
function sendConfEmail(req, res) {
    var textbody;
    if (req.body.isContributor == 1) {
        textbody = "Hi " + req.body.firstName + ", \nThanks for registering with us! You can now start viewing " +
            "and contributing to comics at http://collab-a-comic.herokuapp.com. \n\nCheers, \nTeam Friendship";
    }
    else {
        textbody = "Hi " + req.body.firstName + ", \nThanks for registering with us! You can now start viewing " +
            "comics at http://collab-a-comic.herokuapp.com. \n\nCheers, \nTeam Friendship";
    }
    client.sendEmail({
        "From": "daniel.choi@alumni.ubc.ca",
        "To": req.body.email,
        "Subject": "Collab-A-Comic registration",
        "TextBody": textbody
    }, function (error, success) {
        if (error) {
            console.error("Unable to send via postmark: " + error.message);
            return;
        }
        console.info("Postmark sent email to: " + req.body.email);
    });
}
// Multer file upload
/* GET new comic page */
router.get('/uploadtest', isLoggedIn, isContributor, function (req, res) {
    res.render('uploadtest', {
        user: req.user,
        image: 'images/calvinandhobbes.jpg'
    });
    console.log('Current db: ' + req.mongoose.connection);
});
/* POST new comic */
// https://www.codementor.io/tips/9172397814/setup-file-uploading-in-an-express-js-application-using-multer-js
router.post('/newcomic', isLoggedIn, multer({ dest: './public/uploads/panels/' }).single('upl'), function (req, res) {
    //console.log(req.body); //form fields
    /* example output:
     { title: 'abc' }
     */
    //console.log(req.file); //form files
    /* example output:
     { fieldname: 'upl',
     originalname: 'grumpy.png',
     encoding: '7bit',
     mimetype: 'image/png',
     destination: './uploads/',
     filename: '436ec561793aa4dc475a88e84776b1b9',
     path: 'public/uploads/436ec561793aa4dc475a88e84776b1b9',
     size: 277056 }
     */
    var c = new Comic({
        title: req.body.title,
        originalname: req.file.originalname,
        filename: req.file.filename,
        imgarray: [{
                author: req.user.username,
                panelloc: '/uploads/panels/' + req.file.filename
            }],
        path: req.file.path,
        subs: [{
                subscriber: req.user.username,
                subscriberEmail: req.user.email
            }]
    });
    c.save();
    Account.update({ _id: req.user._id }, { $push: { contributions: {
                cid: c.id,
                title: c.title,
                link: c.link
            } } }, function (err) {
        if (err)
            console.log("Error pushing comic to contributions!");
    });
    Account.findOne({ username: req.user.username }, function (err, doc) {
        if (err) {
            console.log('User not found.');
        }
        else {
            var account = doc;
            //console.log(doc);
            for (var i = 0; i < doc.followers.length; i++) {
                sendSubscriptionEmail(doc.followers[i].followerEmail, doc.followers[i].followerUserName, req.user.username, c.title, c.id, "newComic");
                createNotification(doc.followers[i].followerUserName, req.user.username, c.title, c.id, "newComic");
            }
        }
    });
    res.redirect('/comic/' + c.id);
});
// TODO: what is this doing here?
router.get('/comic', isLoggedIn, function (req, res) {
    res.render('comic', {});
});
/* GET profile page. */
// https://scotch.io/tutorials/easy-node-authentication-setup-and-local
router.get('/profile', isLoggedIn, function (req, res) {
    res.redirect('/user/' + req.user.username);
});
/* GET profile page by dynamic routing */
// http://stackoverflow.com/questions/33347395/how-to-create-a-profile-url-in-nodejs-like-facebook
router.get('/user/:username', isLoggedIn, function (req, res) {
    function checkSub(profileUsername, viewerSubs) {
        for (var i = 0; viewerSubs.length > i; i++) {
            if (viewerSubs[i].followedUserName === profileUsername) {
                return true;
            }
        }
        return false;
    }
    var viewerIsSubbed = checkSub(req.params.username, req.user.following);
    Account.findOne({ username: req.params.username }, function (err, doc) {
        if (err) {
            console.log('User not found.');
        }
        else {
            var account = doc;
            res.render('profile', {
                isSubbed: viewerIsSubbed,
                viewed: doc,
                comics: doc.contributions,
                user: req.user
            });
        }
    });
});
// GET comic page
router.get('/comic/:comicid', isLoggedIn, function (req, res) {
    console.log("Looking for comic...");
    function checkSub(username, subs) {
        for (var i = 0; subs.length > i; i++) {
            if (subs[i].subscriber === username) {
                return true;
            }
        }
        return false;
    }
    Comic.findById(req.params.comicid, function (err, doc) {
        if (err) {
            console.log('Comic not found.');
        }
        else {
            var comic = doc;
            var viewerIsSubbed = checkSub(req.user.username, doc.subs);
            console.log("Is viewer subbed: " + viewerIsSubbed);
            //console.log('Comic: '+doc);
            //console.log('Searching for :' + req.params.comicid);
            res.render('comic', {
                user: req.user,
                viewerName: req.user.username,
                cid: req.params.comicid,
                title: doc.title,
                panelarray: doc.imgarray,
                subscribers: doc.subs,
                isSubbed: viewerIsSubbed
            });
        }
    });
});
// Function to send notification emails
function sendSubscriptionEmail(recipEmail, recipUsername, actorUsername, comic, cid, notificationType) {
    var textbody;
    var subject;
    if (notificationType === "newPanel") {
        textbody = "Hi " + recipUsername + ", \n" + actorUsername + " contributed a new panel to " + comic + "!\n" +
            "You can check it out here: https://collab-a-comic.herokuapp.com/comic/" + cid +
            "\n\nCheers, \nTeam Friendship";
        subject = "Collab-A-Comic: " + actorUsername + " contributed a new panel to " + comic + "!";
    }
    if (notificationType === "newComment") {
        textbody = "Hi " + recipUsername + ", \n" + actorUsername + " posted a new comment on " + comic + "!\n" +
            "You can check it out here: https://collab-a-comic.herokuapp.com/comic/" + cid +
            "\n\nCheers, \nTeam Friendship";
        subject = "Collab-A-Comic: " + actorUsername + " posted a new comment on " + comic + "!";
    }
    if (notificationType === "newComic") {
        textbody = "Hi " + recipUsername + ", \n" + actorUsername + " made a new comic called " + comic + "!\n" +
            "You can check it out here: https://collab-a-comic.herokuapp.com/comic/" + cid +
            "\n\nCheers, \nTeam Friendship";
        subject = "Collab-A-Comic: " + actorUsername + " started a new comic!";
    }
    client.sendEmail({
        "From": "daniel.choi@alumni.ubc.ca",
        "To": recipEmail,
        "Subject": subject,
        "TextBody": textbody
    }, function (error, success) {
        if (error) {
            console.error("Unable to send via postmark: " + error.message);
            return;
        }
        console.info("POSTMARK: recipEmail: " + recipEmail + ", recipName: " + recipUsername + ", actorUsername: " +
            actorUsername + ", comic: " + comic + ", cid: " + cid + ", notificationType: " + notificationType);
    });
}
// Function to create homepage notification
function createNotification(recipUsername, actorUsername, comic, cid, notificationType) {
    var textBody;
    if (notificationType === "newPanel") {
        textBody = actorUsername + " contributed a new panel to " + comic;
    }
    if (notificationType === "newComment") {
        textBody = actorUsername + " posted a new comment on " + comic;
    }
    if (notificationType === "newComic") {
        textBody = actorUsername + " made a new comic called " + comic;
    }
    Account.update({ username: recipUsername }, { $push: { notifications: {
                notificationText: textBody,
                actor: actorUsername,
                comicName: comic,
                notiCid: cid
            } } }, function (err) {
        if (err)
            console.log("Error adding follower!");
    });
}
/* POST new panel to comic */
router.post('/newpanel/:comicid', multer({ dest: './public/uploads/panels/' }).single('upl'), function (req, res) {
    var cid = req.params.comicid;
    //console.log("CID: "+cid);
    var imgloc = '/uploads/panels/' + req.file.filename;
    Comic.update({ _id: cid }, {
        $push: {
            imgarray: {
                author: req.user.username,
                panelloc: imgloc
            }
        }
    }, function (err) {
        if (err)
            console.log('Error adding panel!');
    });
    function checkContributor(contribs, comicId) {
        for (var i = 0; contribs.length > i; i++) {
            if (contribs[i].cid === comicId) {
                return true;
            }
        }
        return false;
    }
    Comic.findById(cid, function (err, doc) {
        if (err) {
            console.log('Comic not found.');
        }
        else {
            // Add comic to contributor's contributions
            if (!checkContributor(req.user.contributions, cid)) {
                Account.update({ _id: req.user._id }, {
                    $push: {
                        contributions: {
                            cid: doc.id,
                            title: doc.title,
                            link: doc.link
                        }
                    }
                }, function (err) {
                    if (err)
                        console.log("Error pushing comic to contributions!");
                });
            }
            // Send notifications to subscribers
            for (var i = 0; i < doc.subs.length; i++) {
                sendSubscriptionEmail(doc.subs[i].subscriberEmail, doc.subs[i].subscriber, req.user.username, doc.title, doc.id, "newPanel");
                createNotification(doc.subs[i].subscriber, req.user.username, doc.title, doc.id, "newPanel");
            }
        }
        res.redirect(req.get('referer'));
    });
});
// Add new subscriber to comic
router.post('/comic/:comicid/subscribers/subscribe', function (req, res) {
    var cid = req.params.comicid;
    var cTitle = "";
    console.log("Trying to subscribe " + req.user.username + " to " + cid);
    Comic.findById(cid, function (err, doc) {
        if (err) {
            console.log('Comic not found.');
        }
        else {
            cTitle = doc.title;
            console.log("Subscribing " + req.user.username + " to " + cTitle);
            // moved this here to make update synchronous
            Account.update({ _id: req.user._id }, { $addToSet: { subs: {
                        subCid: cid,
                        subComicName: cTitle
                    } } }, function (err) {
                if (err)
                    console.log('Error adding subscription!');
            });
        }
    });
    Comic.update({ _id: cid }, { $addToSet: { subs: {
                subscriber: req.user.username,
                subscriberEmail: req.user.email
            } } }, function (err) {
        if (err)
            console.log('Error adding subscriber!');
    });
    res.redirect(req.get('referer'));
});
// Remove an existing subscriber from comic
router.post('/comic/:comicid/subscribers/unsubscribe', function (req, res) {
    var cid = req.params.comicid;
    console.log("Trying to unsub " + req.user.username + " from " + cid);
    Comic.update({ _id: cid }, { $pull: { subs: { subscriber: req.user.username
            } } }, function (err) {
        if (err)
            console.log('Error removing subscriber!');
    });
    Account.update({ _id: req.user._id }, { $pull: { subs: { subCid: cid
            } } }, function (err) {
        if (err)
            console.log('Error removing subscription!');
    });
    res.redirect(req.get('referer'));
});
// POST new subscriber to user
router.post('/user/:profileUsername/subscribers/subscribe', isLoggedIn, function (req, res) {
    var subscriberUsername = req.user.username;
    var subscriberEmail = req.user.email;
    var profileUsername = req.params.profileUsername;
    console.log(subscriberUsername);
    console.log(profileUsername);
    Account.update({ _id: req.user._id }, { $push: { following: { followedUserName: profileUsername } } }, function (err) {
        console.log("FOLLOWING: " + req.user.following);
        if (err)
            console.log("Error adding following!");
    });
    Account.update({ username: profileUsername }, { $push: { followers: {
                followerUserName: subscriberUsername,
                followerEmail: subscriberEmail
            } } }, function (err) {
        if (err)
            console.log("Error adding follower!");
    });
    res.redirect(req.get('referer'));
});
// DELETE existing subscriber from user
router.post('/user/:profileUsername/subscribers/unsubscribe', isLoggedIn, function (req, res) {
    var subscriberUsername = req.user.username;
    var profileUsername = req.params.profileUsername;
    Account.update({ _id: req.user._id }, { $pull: { following: { followedUserName: profileUsername } } }, function (err) {
        console.log("FOLLOWING: " + req.user.following);
        if (err)
            console.log("Error removing following!");
    });
    Account.update({ username: profileUsername }, { $pull: { followers: { followerUserName: subscriberUsername } } }, function (err) {
        if (err)
            console.log("Error removing follower!");
    });
    res.redirect(req.get('referer'));
});
module.exports = router;
//# sourceMappingURL=index.js.map