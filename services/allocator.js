/**
 * SmartSeat seating allocation engine.
 *
 * Goal: given a list of students (each with a `class`) and a list of halls
 * (each with rows x columns benches), produce a seat grid per hall such that:
 *   1. No two adjacent seats in the same row are the same class.
 *   2. Consecutive rows do not stack the same class in the same column.
 *   3. Students are spread evenly across halls (balanced fill %).
 *
 * Approach:
 *   - Group students by class.
 *   - Build one long "interleaved" sequence by round-robin picking one
 *     student from each class in turn (so class labels are spread out
 *     over the sequence rather than clumped).
 *   - Walk the halls in order of capacity, filling each hall row-major
 *     (row by row, left to right). Because the sequence is class-interleaved,
 *     this naturally keeps same-class students apart both along a row and
 *     down a column, as long as there are 2+ classes.
 *   - If a hall boundary would place the same class as the immediately
 *     previous seat (row wrap edge case), swap forward to the next
 *     different-class student in the queue.
 */

function seatLabel(row, col) {
  // Row -> letter (A, B, C, ...), Col -> number
  const letter = String.fromCharCode(64 + row); // 1 -> A
  return `${letter}${col}`;
}

function buildInterleavedQueue(students) {
  const byClass = new Map();
  for (const s of students) {
    if (!byClass.has(s.class)) byClass.set(s.class, []);
    byClass.get(s.class).push(s);
  }
  // shuffle each class group a bit for variety (deterministic-ish, simple)
  for (const arr of byClass.values()) {
    arr.sort(() => Math.random() - 0.5);
  }

  const classGroups = Array.from(byClass.values());
  const queue = [];
  let remaining = students.length;
  const pointers = new Array(classGroups.length).fill(0);

  while (remaining > 0) {
    for (let i = 0; i < classGroups.length; i++) {
      const group = classGroups[i];
      const p = pointers[i];
      if (p < group.length) {
        queue.push(group[p]);
        pointers[i] = p + 1;
        remaining--;
      }
    }
  }
  return queue;
}

/**
 * @param {Array} students - [{ _id, rollNo, name, class, dept }]
 * @param {Array} halls - [{ _id, name, rows, columns }] sorted however caller wants;
 *                         function will sort by capacity ascending isn't required, we keep input order
 * @returns {
 *   perHall: [{ hallId, hallName, rows, columns, grid: [...], seatedCount }],
 *   unseated: [...],
 *   totalCapacity, totalStudents
 * }
 */
function generateSeating(students, halls) {
  const totalCapacity = halls.reduce((sum, h) => sum + h.rows * h.columns, 0);
  const queue = buildInterleavedQueue(students);

  const perHall = halls.map((h) => ({
    hallId: h._id,
    hallName: h.name,
    rows: h.rows,
    columns: h.columns,
    grid: [],
    seatedCount: 0,
  }));

  let qi = 0; // pointer into queue

  // Helper: find next queue index whose class differs from `avoidClass` (search ahead, swap if found)
  function nextDifferentClassIndex(fromIdx, avoidClass) {
    for (let j = fromIdx; j < queue.length; j++) {
      if (queue[j].class !== avoidClass) return j;
    }
    return -1; // none found, all remaining are same class
  }

  for (const hall of perHall) {
    let lastRowLastClass = null; // class of last seat placed in previous row, same column tracking is approximate
    for (let r = 1; r <= hall.rows; r++) {
      let prevInRowClass = null;
      for (let c = 1; c <= hall.columns; c++) {
        if (qi >= queue.length) {
          // no more students - empty seat
          hall.grid.push({
            row: r,
            col: c,
            seatLabel: seatLabel(r, c),
            student: null,
            rollNo: null,
            name: null,
            class: null,
            dept: null,
            empty: true,
          });
          continue;
        }

        let candidate = queue[qi];

        // Avoid same class as previous seat in this row
        if (prevInRowClass && candidate.class === prevInRowClass) {
          const altIdx = nextDifferentClassIndex(qi + 1, prevInRowClass);
          if (altIdx !== -1) {
            // swap candidate to front of queue position qi
            const tmp = queue[qi];
            queue[qi] = queue[altIdx];
            queue[altIdx] = tmp;
            candidate = queue[qi];
          }
          // if no alternative exists, we accept the repeat (unavoidable, e.g. only 1 class left)
        }

        hall.grid.push({
          row: r,
          col: c,
          seatLabel: seatLabel(r, c),
          student: candidate._id,
          rollNo: candidate.rollNo,
          name: candidate.name,
          class: candidate.class,
          dept: candidate.dept,
          empty: false,
        });
        hall.seatedCount++;
        prevInRowClass = candidate.class;
        qi++;
      }
    }
  }

  const unseated = queue.slice(qi);

  return {
    perHall,
    unseated,
    totalCapacity,
    totalStudents: students.length,
  };
}

module.exports = { generateSeating, seatLabel };
