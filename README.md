# SmartSeat — Automated Examination Hall Allocation System

Teachers enter each hall's bench layout (rows × benches per row) and upload the
student list. SmartSeat automatically splits students across halls so that no
two students from the same class sit next to each other, and gives you a
printable hall-wise seating plan plus a roll-number search.

**Stack:** HTML/CSS/JavaScript (vanilla, no build step) + Node.js/Express + MongoDB.

## 1. Requirements

- Node.js 18+
- MongoDB running locally, or a free MongoDB Atlas cluster

## 2. Setup

```bash
cd smartseat
npm install
cp .env.example .env
# edit .env and set MONGO_URI plus a strong JWT_SECRET
npm start
```

Open **http://localhost:4000** in your browser.

On first use, create a staff account with an organization/workspace name,
department, and password. The first staff account in an organization becomes
that organization's tenant administrator; later accounts are scoped to their
own department. Authentication uses an HTTP-only JWT cookie. Every API route
verifies the session and tenant scope on the server.

## 3. How to use it (matches the app's sidebar order)

1. **Students** — add students one by one, or click **Import CSV** with a file
   that has the columns `rollNo, name, class, dept`.
2. **Halls** — enter each hall's name, number of rows of benches, and benches
   per row. Capacity is calculated automatically (rows × columns) — you never
   type capacity by hand.
3. **Exam Setup** — create the exam (name, subject, date, time), then click
   **Assign halls** on that exam and tick which halls will be used.
4. **Generate Seating** — pick the exam and click **Generate seating plan**.
   The system pulls in every student in the current department, spreads the
   classes out (round-robin across classes), and fills each hall row by row,
   swapping ahead in the queue whenever two same-class students would land
   next to each other in a row.
5. **View Seating** — pick the exam to see each hall's grid, color-coded by
   class, with a **Print seating plan** button for a clean printable version.
6. **Search** — pick the exam, type a roll number, and get the student's hall,
   row, column and seat label instantly.

The **Dashboard** shows total students/halls/seats, how many seats are filled
for the most recently generated exam, and a hall-by-hall utilization bar.

## 4. How the seating algorithm avoids same-class neighbors

See `services/allocator.js`. In short:

- Students are grouped by class, then merged back into one queue by taking
  one student from each class in turn (round robin) — so the same class never
  clusters together in the queue.
- Halls are filled row by row, left to right, straight from that queue.
- Before placing a seat, the algorithm checks the previous seat in the same
  row; if it's the same class, it searches ahead in the queue for the next
  student of a different class and swaps them forward. This keeps the "no
  same class beside each other" rule even at hall/row boundaries.
- If capacity across all assigned halls is less than the number of students,
  the leftover students are reported as **unseated** so you know to add
  another hall.

## 5. Project structure

```
smartseat/
├── server.js              # Express app entrypoint + dashboard stats endpoint
├── models/
│   ├── Student.js
│   ├── Hall.js             # capacity is a virtual = rows × columns
│   ├── Exam.js
│   └── Seat.js             # one document per hall per exam = the seating grid
├── routes/
│   ├── students.js         # CRUD + CSV import
│   ├── halls.js             # CRUD
│   └── exams.js             # CRUD, generate seating, view seating, search
├── services/
│   └── allocator.js        # the seating algorithm
└── public/                 # frontend (no framework, no build step)
    ├── index.html
    ├── style.css
    └── app.js
```

## 6. CSV import format

```csv
rollNo,name,class,dept
23CSE001,Arun,CSE-A,CSE
23ECE001,Meena,ECE-A,ECE
23CSE002,Ravi,CSE-A,CSE
```

Importing again with the same `rollNo` updates that student instead of
duplicating them.
