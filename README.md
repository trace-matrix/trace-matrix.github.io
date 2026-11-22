# TraceMatrix — Competitive Programming Visualizer ⊞ ✛ ♟

> **TraceMatrix** is a fast, interactive visualizer built specifically for Competitive Programmers (Codeforces, AtCoder, LeetCode, CSES, ICPC). It provides zero-lag scratchpads for 2D Grids, Matrix transformations, Coordinate Geometry, and Chessboard problem solving.

**Live Website**: [https://trace-matrix.github.io](https://trace-matrix.github.io)

---

## 🌟 Key Features

### 1. ⊞ Matrix & Grid Visualizer (`GridVis`)
- **Dimensions**: Arbitrary $R \times C$ grids (from $1 \times 1$ up to $100 \times 100$).
- **Indexing Toggle**: 1-click switch between **0-indexed** (`0..R-1`, `0..C-1`) and **1-indexed** (`1..R`, `1..C`).
- **Interactive Tools**:
  - `Inspect`: Click/hover cell to view coordinates, 1D flattened index ($r \cdot C + c$), and value.
  - `Submatrix & 2D Prefix Sums`: Drag a bounding box $[r_1, c_1] \dots [r_2, c_2]$ to view cell sum, min, max, average, and the exact Inclusion-Exclusion formula breakdown:
    $$\text{Sum} = P[r_2][c_2] - P[r_1-1][c_2] - P[r_2][c_1-1] + P[r_1-1][c_1-1]$$
  - `Pathfinding`: Run **BFS (Shortest Path)**, **DFS**, or **Multi-source BFS** with 4-directional or 8-directional movement options. Displays step distance numbers and golden shortest path.
  - `Heatmap`: Automatic color gradient scaling for DP tables (e.g. LCS, Knapsack, Edit Distance).
- **Matrix Transformations**:
  - Rotate 90° Clockwise
  - Rotate 90° Counter-Clockwise
  - Transpose ($A[r][c] \leftrightarrow A[c][r]$)
  - Flip Horizontal & Flip Vertical
- **CP Judge I/O Parser**:
  - Paste matrices directly from problem test cases (numbers, or character grids with `.`, `#`, `S`, `E`).
  - 1-click export to C++ `vector<vector<int>>` or Python list.

---

### 2. ✛ Points & Geometry Visualizer (`PointVis` / Desmos-grade)
- **Infinite Coordinate Plane**: Smooth wheel zoom, panning, and adaptive grid lines that subdivide seamlessly.
- **Coordinate Conventions**: Toggle between **Cartesian (Y points up)** and **Screen/Matrix (Y points down)**.
- **Integer Snap**: Automatic lattice snapping for integer geometry problems.
- **Computational Geometry Algorithms**:
  - **Convex Hull (Andrew's Monotone Chain)**: Computes hull vertices in CCW order, perimeter, and area.
  - **Closest Pair of Points**: Highlights closest pair and displays Euclidean ($L_2$), Manhattan ($L_1$), and Chebyshev ($L_\infty$) distances.
  - **Polygon Area (Shoelace) & Pick's Theorem**:
    $$\text{Area} = I + \frac{B}{2} - 1 \implies I = \text{Area} - \frac{B}{2} + 1$$
    Calculates interior lattice points $I$ and boundary points $B = \sum \gcd(|\Delta x|, |\Delta y|)$.
  - **Orientation & Cross Product (CCW)**:
    $$\vec{AB} \times \vec{AC} = (B_x - A_x)(C_y - A_y) - (B_y - A_y)(C_x - A_x)$$
    Classifies turns: Counter-Clockwise (left turn), Clockwise (right turn), or Collinear.
- **CP Points I/O**:
  - Paste raw $N$ lines of `x y` coordinates.
  - Copy formatted C++ `struct Point { long long x, y; };` array.

---

### 3. ♟ Chess & Board Visualizer (`ChessVis`)
- **Arbitrary Board Dimensions**: Any $N \times M$ board (default $8 \times 8$).
- **Square Labeling**: Algebraic (`a1` .. `h8`), 0-indexed, or 1-indexed notation.
- **Pieces**: Knight (♞), Queen (♛), Rook (♜), Bishop (♝), King (♚), Pawn (♟).
- **CP Solvers**:
  - **Knight Reachability & Shortest Path (BFS)**: Computes minimum knight jumps from a source square to *every* square on the $N \times M$ board. Click any square to draw the shortest path with arrows!
  - **N-Queens Solver & Solution Browser**: Backtracking solver for $N$-Queens with next/prev solution browsing and auto-play.
  - **Knight's Tour (Warnsdorff's Heuristic)**: Generates and draws the full sequence of knight moves covering the board.
  - **Distance Heatmap Overlays**: Manhattan distance, Chebyshev distance (King moves), and Bipartite checkerboard parity $((r+c) \pmod 2)$.

---

### 4. </> CP Snippets & Templates
- Ready-to-copy C++20 and Python snippets:
  - 2D Prefix Sum struct (1-indexed query)
  - Grid BFS & 4/8/Knight direction arrays
  - Point struct with Andrew's Monotone Chain Convex Hull
  - Shoelace formula & Pick's Theorem calculation

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `1` | Switch to Matrix & Grid tab |
| `2` | Switch to Points & Geometry tab |
| `3` | Switch to Chess & Board tab |
| `4` | Switch to CP Snippets tab |
| `I` | Toggle 0-indexed vs 1-indexed coordinates |
| `F` | Auto-fit grid / points / board to view |
| `0` | Reset zoom and pan to default (1:1 / 0,0) |
| `+` / `−` | Zoom in / Zoom out |
| `Space` + Drag | Pan canvas viewport |
| `H` | Compute Convex Hull (in Point mode) |
| `Enter` | Run Pathfinding / Knight BFS |
| `?` | Show Keyboard Shortcuts cheat sheet |

---

## 🚀 Technology & Architecture
- **Pure Modern Web**: Vanilla HTML5, Canvas API, and modern CSS (`color-scheme: light dark`).
- **Zero External JS Dependencies**: Loads in < 50ms, works completely offline, zero maintenance overhead.
- **High-DPI Rendering**: Automatic `window.devicePixelRatio` scaling for ultra-crisp lines on 4K and Retina screens.
