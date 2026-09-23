# Setting up the event on another laptop

The laptop that runs the event has to be on the **same network as the lab
machines** (10.0.11.x). That is the whole reason for moving: the first
laptop only had Wi-Fi, and the lab is cabled to a different network.

The new laptop needs **Node.js** and an **Ethernet port**. It does *not*
need MongoDB, because the database now lives in MongoDB Atlas.

---

## 1. Create the Atlas database (do this once, on either laptop)

1. Go to <https://cloud.mongodb.com> and sign in or sign up. The free
   **M0** tier is enough for this event.
2. **Build a Database** → **M0 Free** → pick the region closest to you →
   Create.
3. **Database Access** → Add New Database User. Give it a username and
   password. Write the password down; you need it in a moment. Role:
   **Read and write to any database**.
4. **Network Access** → Add IP Address → **Allow access from anywhere**
   (`0.0.0.0/0`). The event laptop's address changes between networks, so
   pinning it would break tomorrow.
5. **Database** → **Connect** → **Drivers** → copy the connection string.
   It looks like:

   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. Add the database name `lost_at_sql` before the `?`:

   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/lost_at_sql?retryWrites=true&w=majority
   ```

---

## 2. Move the data into Atlas (on the OLD laptop, once)

The old laptop still has the event: six case files, the accounts and their
access codes, the dataset, the settings.

```bash
npm run export
```

Then put the Atlas string in `server/.env` as `MONGODB_URI=...` and run:

```bash
npm run import
```

Every account keeps the code you already printed, because what is stored is
the hash and the hash is copied as-is.

---

## 3. Set up the new laptop

1. Install **Node.js 20 or newer** from <https://nodejs.org>.
2. Clone the project:

   ```bash
   git clone <your-repo-url> Zinnia
   cd Zinnia
   ```

3. Install the packages. This needs internet and takes a few minutes:

   ```bash
   npm install
   npm install --prefix client
   npm install --prefix server
   ```

4. Create `server/.env`. **It is not in the repository on purpose** — it
   holds the secret key and the Atlas password. Copy it from the old laptop
   on a USB stick, or copy `server/.env.example` to `server/.env` and fill
   in `MONGODB_URI` and `JWT_SECRET`.

5. Plug the Ethernet cable from the lab network into the new laptop.

6. Start it:

   ```bash
   npm run lab
   ```

   It prints the address to give the lab. It will be a 10.0.11.x address,
   the same range as the lab machines, so they can reach it.

---

## 4. Check before the students arrive

- On one lab machine, open the address `npm run lab` printed. The sign-in
  page should appear.
- Sign in as one investigator, run a query, submit an answer.
- If the page does not load, check the new laptop's firewall allows port
  5173 on the network it is on.

---

## What changed by moving to Atlas

**The event now needs internet.** With the database in the cloud, if the
college internet drops mid-event the game stops for everyone. Local MongoDB
did not have that dependency.

If you want the safety net: install MongoDB locally on the new laptop as
well, keep a copy of `transfer/event-data.json` on it, and if the internet
fails, change `MONGODB_URI` in `server/.env` back to
`mongodb://127.0.0.1:27017/lost_at_sql`, run `npm run import`, and restart.
That takes about two minutes and loses only the scores from that run.
