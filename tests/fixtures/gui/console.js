console.log("headless console");
setTimeout(
    () => Promise.resolve().then(() => console.log("headless progress")),
    10,
);
