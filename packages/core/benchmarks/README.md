# Resource leveling benchmark

Build the core package and run the benchmark from the repository root:

```sh
npm run build --workspace=@jantt/core
node packages/core/benchmarks/resource-leveling.mjs
```

Pass specific scenarios to limit the run, for example:

```sh
node packages/core/benchmarks/resource-leveling.mjs 1000:50 100:5:calendar 25:0:crowded
```

Arguments are `task-count:conflicting-pairs[:mode]`. In `plain` mode each pair
shares a resource; other tasks have separate resources. `calendar` adds a
Monday–Friday calendar and a holiday. `crowded` assigns every task to one
resource and requires a pair count of zero. `dependent` adds a successor for
each movable task, while the other task in the pair is locked; the task count
must be at least three times the number of pairs.

Tasks have one-day durations using the scheduler's exclusive end date. Each
scenario verifies its expected conflicts and adjustments, and reports the
median, minimum and maximum of three measured runs after a warmup. The timing
covers the leveling call, not worker startup or browser rendering. The
iteration limit is raised to the task count so crowded cases can finish.
