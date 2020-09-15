## Model Phone System

This system is a recreation of my university design project.  It features an administrative UI, pretend phone processes
(the original university version interacted with Nortel IPPhones), and a server backend that ties everything together.

The UI can be used to add customers, who may have multiple phone accounts associated with them.  Each phone account needs
a unique four-digit number ('####' can be entered to have the system generate one automatically), as well as a billing plan.
Billing plans have a per month cost, a per minute cost, and optional discount periods, which can apply to one day of the week,
or all days of the week.  It is possible to change a phone account's billing plan mid billing period; the monthly charges will
be pro-rated based on when the change occurred.  Once a day (currently set to 3AM), the database is queried for any bills
that have reached the threshold of a month active.  The bills are then finalized, and new bills are opened to replace them.
If a phone account reaches three unpaid bills, it is automatically suspended until at least one bill has been paid off in full.

### How to Run

Make sure to install all dependencies.  The UI was bootstrapped with [Create React App](https://github.com/facebook/create-react-app),
and has its own package.json.  Also, the phone emulator requires the client portion of python-socketio.

The system uses SSL by default, and expects key and certificate to be in /ssl/key.pem and /ssl/certificate.pem, respectively.

Some environment variables can be set.  I used a nodemon.json file in development, but dotenv would be easy to add to `server.js`.
* `DB_CONN` (**required**) - a connection string for a MongoDB instance
* `PORT` - the server port (defaults to 5000)
* `SESSION_PWD` - the password to encrypt server sessions
* `ADD_ADMIN` - setting this to true creates an admin account on starting the server (details can be set towards the top of `server.js`).  I judged managing admin credentials to be beyond the scope of this project, but it is a potential area for expansion.

Running the phone emulator requires phone accounts to be configured, and takes the _id (as a string) on the command line.

To launch both the server and UI, use `npm run dev`.