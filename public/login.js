const form = document.getElementById("login-form");
const passcodeInput = document.getElementById("passcode");
const loginButton = document.getElementById("login-button");
const errorElement = document.getElementById("login-error");

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
}

function hideError() {
  errorElement.textContent = "";
  errorElement.hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const passcode = passcodeInput.value;
  if (passcode.trim() === "") {
    showError("Enter the passcode.");
    passcodeInput.focus();
    return;
  }

  loginButton.disabled = true;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode })
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (response.ok) {
      window.location.replace("/");
      return;
    }
    showError(typeof data.error === "string" ? data.error : "Sign-in failed.");
  } catch (error) {
    showError("The server could not be reached.");
  } finally {
    loginButton.disabled = false;
  }
});
