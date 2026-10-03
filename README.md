# Factory Ledger — Desktop App

A local desktop app for a clothing factory: daily purchases, production runs, inventory, sales,
client/supplier balances, and monthly reports. Arabic (default) and English.
Data is stored in a real **SQLite database file** on your own computer — no internet, no account,
and no separate database server needed to use it.

## Requirements
- Install Node.js (LTS) from https://nodejs.org — this is a one-time setup step.
- **Don't want to install Node.js?** Skip to "Build in the cloud instead" below — it needs nothing installed on your computer.

## First-time setup
Open a terminal in this folder and run:

```
npm install
```

## Try it out (development mode)
```
npm run electron:dev
```
This opens the app in a window. Close the window to quit.

## Build the installer — one file to give your client
```
npm run dist
```
This creates a single file in the `release/` folder, e.g. `Factory-Ledger-Setup-1.4.0.exe`.

**That one file is everything your client needs.** Send it to them (USB drive, WhatsApp, email, Google Drive — anything).
They just double-click it: no options screen, no questions — it installs the app, adds a "Factory Ledger" icon to
the Desktop and Start Menu, and launches it automatically. Nothing else to run or configure.

Notes:
- Build the installer on the same type of machine you're targeting: build on Windows for a Windows `.exe`, on Mac for a `.dmg` (Mac installers work by drag-to-Applications rather than one-click, since that's the standard Mac pattern).
- Each computer's data is separate and stored locally (not synced between machines).

## Build in the cloud instead (no Node.js, nothing installed on your computer)

This folder includes a ready-made cloud build recipe (`.github/workflows/build.yml`). GitHub will
install everything and build the `.exe` on their servers — you only use a browser.

1. Go to https://github.com and create a free account if you don't have one.
2. Click **New repository** (top right → your avatar → "Your repositories" → "New"). Name it
   anything, e.g. `factory-ledger`. Public or private both work. Click **Create repository**.
3. On the new repo's page, click **uploading an existing file** (or "Add file" → "Upload files").
4. Open this unzipped folder on your computer, select everything inside it (including the hidden
   `.github` folder and the `build` folder that holds the app icon — on Windows, enable "show hidden
   items" in File Explorer's View menu first),
   and drag it all into the browser upload area. Click **Commit changes**.
5. Go to the **Actions** tab of the repository. If asked, click "I understand my workflows, go ahead
   and enable them".
6. Click **Build Installer** in the left list, then the **Run workflow** button, then **Run workflow**
   again to confirm.
7. Wait 3–5 minutes for it to finish (green checkmark).
8. Click into the finished run, scroll down to **Artifacts**, and download `factory-ledger-installer`.
   Unzip it — inside is your one file, `Factory-Ledger-Setup-1.4.0.exe`. That's what you send to your
   client.

You only repeat this if you change the app later. Each run is free under GitHub's free-tier minutes.

## First-time setup inside the app (Settings tab)

Open **Settings** (الإعدادات) in the sidebar once and fill in:

- **Company details** — Arabic and English company name, address, phone, email, tax registration
  number, commercial register number, and a logo (PNG/JPG). These appear on every printed statement,
  every saved PDF, and at the top of every Excel report. The sidebar also shows the company name.
- **Document numbering** — a prefix (e.g. `INV` or `SOA`) and the number to start from (handy if the
  factory already used numbers up to, say, 119 in a paper book — enter 120). Statements are numbered
  like `INV-2026-0120`, restarting at 1 each new year.
- **Footer note** — optional line printed at the bottom of statements, e.g. "Thank you for your business".

## Statements, PDFs and Excel reports

- **Invoices tab** → pick a client/supplier and a date range → **Print** or **Save as PDF**. The PDF
  has page numbers and is saved wherever you choose; a notification offers to open it straight away.
- A statement gets its permanent number the first time it's printed or saved. Printing the same
  client + period + mode again reuses that number, so re-prints don't use up numbers. The on-screen
  preview shows the number it will get before you commit.
- **Reports tab** → real Excel `.xlsx` files (no more "file format doesn't match" warning). Amounts are
  real numbers (you can sum/filter them in Excel), sheets are right-to-left in Arabic, the header row
  stays frozen, totals rows use live `SUM` formulas, and they print to fit the page width. **Download
  full monthly workbook** puts all four reports into one file, one sheet each.
- **About** (sidebar) shows the app version and where the data file lives, with a button to open that folder.

## Inventory and production (new in version 1.3)

The app now follows your stock from fabric to finished product:

1. **Buy materials** on the Purchases page as before. For each line you can type the **total amount**
   you paid (the unit price is worked out for you) or the unit price. Lines that use an item from the
   catalog add to that item's stock.
2. **Record a production run** on the new **Production** page: choose the materials used and how much,
   enter the **tailoring / labour cost** (and any other costs), then list the products that came out
   and how many pieces. The app shows the **total cost** and the **cost per piece**, takes the
   materials out of stock and puts the products in.
   - A run can produce **several products**. The cost is split by number of pieces, or by percentages
     you type ("Manual shares") when the products don't cost the same to make.
   - Enter the **selling price** next to each product to see the profit per piece; it becomes the
     product's default price on the Sales page.
3. **Sell** on the Sales page. Picking a product shows how many are in stock, and saving the sale takes
   them out. The profit shown on the Dashboard and Reports is now the real one:
   sales − cost of the goods sold − purchases that don't go into stock − expenses.

Other things to know:

- **Items page**: each item is a *material* or a *product*, with an optional **size** and **colour**.
  When adding a new item, type several sizes and colours separated by commas ("S, M, L" and
  "black, white") to create one item for each combination in one go.
- **Inventory page**: quantity, average cost and value of everything in stock, low-stock badges, a
  history of every movement per item, and **Adjust stock** for opening stock, stock counts and waste.
  Exportable to Excel, and included in the full monthly workbook.
- **Warnings and blocking** (Settings → Inventory): choose the quantity at which an item is flagged as
  low (each item can have its own level), whether a sale or production run is **blocked** when there
  isn't enough stock, and the minimum quantity that must stay in stock.
- Costs use a **weighted average**: every purchase updates the item's average cost.
- Stock is calculated from your entries, so editing or deleting an old purchase, run or sale corrects
  the stock and costs everywhere automatically.
- The tailoring cost entered in a production run is part of the product's cost. Don't also enter it as
  an Expense, or it will be counted twice.
- Upgrading from 1.2 keeps all data; a copy of the old database is saved next to it as
  `factory-ledger.before-v3.sqlite` (or `before-v4`). Existing catalog items start with zero stock — use **Adjust stock**
  → *Opening stock* to enter what you already have.

## Client orders — working as a broker (new in version 1.4)

Use the **Client orders** page when you are the middleman between a client and a factory: the client
pays money or hands over fabric, the factory makes the products, and you keep a commission.

1. **New client order**: choose the client, name the order and list the products and pieces.
2. **Commission**, chosen per order:
   - a percentage of the order's cost, a percentage of the product's selling price, or a fixed amount
     per piece;
   - one value for the whole order, or a different value for each product.
3. **Money from the client**: deposits and later payments, and anything you give back. These are not
   sales — the money is held for the client.
4. **Fabric from the client**: what he handed over, how much was used and how much was returned. It
   stays his and never enters your own stock. Whatever is left stays with you for his next order and
   is listed under "Clients' fabric you hold".
5. **Order costs**: fabric bought for the order, the factory's charge, other costs. Pick the supplier
   or factory and the amount goes on their account like any purchase (with what you paid so far); with
   no supplier it counts as paid in cash.
6. Tick **Order delivered** when the client receives the products. The total due (cost + commission) is
   put on the client's account, and the order shows what he still owes or what is to be returned.

How it shows up elsewhere:

- Only the **commission** counts in your profit (in the month of delivery). The client's money and the
  costs spent for him are left out of your sales and purchases; they do appear in money in / money out.
- The client's and the factory's balances, statements of account and the aging report include the
  order's entries. To change one of them, edit the order.
- Costs are shared between an order's products by number of pieces.
- In "percentage of selling price" mode, the client is still charged cost + commission; the selling
  price is only what the percentage is calculated on.

## For developers

`npm test` runs the stock/costing tests and the database tests (the real main-process handlers against
a version-1.2 database).

## What was added in version 1.2

- **Several items per purchase or sale** — each entry can have as many lines as needed (item, quantity,
  unit price); the grand total is calculated for you. Statements list every item on its own line.
- **Items & fabrics catalog** — save the things you buy and sell with their unit and default purchase/sale
  price. When you type an item name in a purchase or sale, it's suggested and its price filled in.
- **Expenses** — rent, salaries, utilities, transport, maintenance, supplies, other. Counted in money out
  and in the **estimated profit** on the Dashboard and Reports.
- **Date filters** on Purchases, Sales and Expenses (this month, last month, last 3 months, this year,
  all time, or custom dates) with totals for whatever is shown.
- **Dashboard charts** — money in vs out for the last 12 months (hover a month for details), who owes
  you the most, and how old the unpaid balances are.
- **Aging report** (Reports tab) — every open balance split into 0–30, 31–60, 61–90 and 90+ days, for
  clients (owed to you) and suppliers (you owe). Exportable to Excel; included in the full monthly workbook.
- **Keyboard shortcuts** (press **F1** in the app for the list): Ctrl+N new entry · Ctrl+F search ·
  Ctrl+P print statement · Ctrl+1…9 switch between the first nine pages · Ctrl+Enter save a form · Esc close. They work with
  the Arabic keyboard layout too.
- **Password reset with a recovery code** — see "Forgotten password" below.
- **Automatic updates** — see the next section.
- Safer saving: the database is written to a temporary file first and then swapped in, so a power cut
  mid-save can't corrupt it. Before upgrading an older database, a one-time copy is kept next to it as
  `factory-ledger.before-v2.sqlite`.

## Automatic updates (how to ship a new version)

Installed copies of the app check GitHub for a newer version when they start and every 6 hours. A new
version downloads quietly in the background; the app then shows **"Restart & update"** in the sidebar
(and in a notification). If they don't click it, the update installs the next time the app is closed.
No internet → nothing happens, the app works as normal.

**One-time setup**

1. The repository must be **public**, because installed apps download updates from its Releases page
   without logging in. To check: open the repo on GitHub — next to its name it says *Public* or
   *Private*. To change: repo **Settings** → **General** → scroll to **Danger Zone** → **Change
   visibility** → Public. (The app contains no passwords or customer data — those live only in each
   computer's local database file.)
2. In `package.json`, under `"build"` → `"publish"`, `"owner"` and `"repo"` must match your repository's
   address: `github.com/<owner>/<repo>`. They're currently set to `Seifabdin442` / `Factory-inventory`.
3. Install the app **by hand once** on each computer (download the `.exe` from the Releases page).
   From then on, updates are automatic.

**Every time you want to send out an update**

1. In `package.json`, increase `"version"` (e.g. `1.4.0` → `1.4.1`). Updates only go out when this
   number goes up — the release workflow stops with a clear message if you forget.
2. Upload the changed files to GitHub as usual and commit.
3. **Actions** tab → **Release (auto-update)** → **Run workflow**. It builds the installer and publishes
   it as a GitHub Release (you'll see it under **Releases** on the repo page).
4. That's it — every installed copy picks it up on its own. The installer `.exe` is also attached to the
   release (and to the workflow run) for installing on new computers.

The older **Build Installer** workflow still works for test builds: it makes an installer you can try
yourself without sending an update to anyone.

## The database file — backup, restore, and direct editing

All data lives in one file called `factory-ledger.sqlite`, found here:

- Windows: `%APPDATA%\factory-ledger\factory-ledger.sqlite`
- Mac: `~/Library/Application Support/factory-ledger/factory-ledger.sqlite`
- Linux: `~/.config/factory-ledger/factory-ledger.sqlite`

**Backup:** close the app, copy that file somewhere safe (USB drive, cloud folder). That's the entire backup.

**Restore / move to another computer:** close the app, replace the file at that same path with your
backup copy, then reopen the app.

**View or edit the raw records directly:** download the free, official
[DB Browser for SQLite](https://sqlitebrowser.org/) (no account needed), open `factory-ledger.sqlite`
with it, and you can browse, filter, and hand-edit the `parties` and `transactions` tables directly —
useful for bulk corrections or double-checking the numbers outside the app. Close the app first so the
file isn't in use, and make a backup copy before editing directly.

## Login and giving this to multiple people

The app now opens to a login screen. The **same installer file** works for everyone — there's nothing
to configure per person before you build it. Each person's computer gets its own separate database
(their own `factory-ledger.sqlite`), so their data never mixes with anyone else's.

**Steps to set someone up, start to finish:**

1. Build the installer once (`npm run dist`, or the GitHub Actions cloud build above) — you only do
   this step yourself, one time, no matter how many people you're giving it to.
2. Send that one installer file to each person (USB, email, WhatsApp, cloud drive — whatever's easiest).
3. They double-click it. It installs, adds a desktop icon, and opens the app automatically — no
   questions asked during install.
4. The first time the app opens on their computer, it shows **"Set up the admin account"** instead of
   a normal login. They pick a username and password there and then — this becomes their own admin
   login, separate from anyone else's, since it's saved in their own local database file.
5. From then on, opening the app (from the desktop icon) always asks for that username and password
   first. There's a **Log out** button in the sidebar if they want to lock it without closing the app.

### Forgotten password — recovery code

When the admin account is created (or, on computers upgraded from an older version, at the first
login after the upgrade) the app shows a **recovery code** like `H6TB-XRM9-4N6D-PFB4` **once**. Write it
down or use **Save as file** and keep it somewhere safe away from the computer.

- Forgot the password → on the login screen click **Forgot password?**, enter the recovery code and a
  new password. The app also shows the username, in case that was forgotten too.
- Each code works **once**: after a reset a new code is shown — save that one instead.
- **Settings → Security** lets you change the password or create a new recovery code (needs the current password).
- After 5 wrong attempts at the password or the code, the app makes you wait before trying again.
- Lost both the password *and* the code? The last resort is still to open `factory-ledger.sqlite` in
  DB Browser for SQLite and delete the row in the `users` table (business data is kept) — the next
  launch shows "Set up the admin account" again.
