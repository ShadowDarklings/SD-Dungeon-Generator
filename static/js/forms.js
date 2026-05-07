// Course 506 Week 5 — Client-side JavaScript
//
// This file demonstrates the one piece of work the browser has to do that
// the server can't: respond instantly to user input.
//
// The server-side login form works without any JavaScript at all. Try it.
// You'll notice that if you click "Log in" twice quickly, two POST requests
// go to the server. That's a real bug — duplicate form submissions can
// create duplicate records, charge a credit card twice, etc.
//
// The fix is two lines of JavaScript: when a form is submitted, disable
// its submit button until the response comes back.
//
// The assignment asks us to enable the fix, so the handler is active.

document.querySelectorAll("form[data-disable-on-submit]").forEach(form => {
    form.addEventListener("submit", () => {
        const button = form.querySelector("button[type='submit']");
        if (button) {
            button.disabled = true;
            button.textContent = "...";
        }
    });
});
