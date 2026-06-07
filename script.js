const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyO5Q72jWSk3ibg16_Whwht_klXnUvfmno73Is2v-cbWNDW9WavTv_4eCs74YAyrLBx/exec";

async function uploadCockpitCsv() {
  const fileInput = document.getElementById("csvFile");
  const uploadedByInput = document.getElementById("uploadedBy");
  const status = document.getElementById("status");

  const file = fileInput.files[0];

  if (!file) {
    alert("Please choose a CSV file first.");
    return;
  }

  status.textContent = "Reading CSV file...";

  const csvText = await file.text();

  status.textContent = "Uploading to backend...";

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "adminUpload",
        csvText: csvText,
        uploadedBy: uploadedByInput.value || "Unknown",
        replaceExisting: false
      })
    });

    const result = await response.json();

    console.log(result);

    if (result.success) {
      status.textContent = "Upload successful. Rows uploaded: " + result.rowsUploaded;
      alert("Upload successful!");
      return;
    }

    if (result.requiresConfirmation) {
      const confirmReplace = confirm(
        result.message + "\n\nDo you want to replace this class list?"
      );

      if (confirmReplace) {
        await replaceExistingClass(csvText, uploadedByInput.value || "Unknown");
      } else {
        status.textContent = "Upload cancelled.";
      }

      return;
    }

    status.textContent = "Upload failed: " + result.error;
    alert("Upload failed: " + result.error);

  } catch (error) {
    console.error(error);
    status.textContent = "Error connecting to backend.";
    alert("Error connecting to backend.");
  }
}


async function replaceExistingClass(csvText, uploadedBy) {
  const status = document.getElementById("status");

  status.textContent = "Replacing existing class list...";

  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "adminUpload",
      csvText: csvText,
      uploadedBy: uploadedBy,
      replaceExisting: true
    })
  });

  const result = await response.json();

  console.log(result);

  if (result.success) {
    status.textContent = "Class list replaced successfully. Rows uploaded: " + result.rowsUploaded;
    alert("Class list replaced successfully!");
  } else {
    status.textContent = "Replacement failed: " + result.error;
    alert("Replacement failed: " + result.error);
  }
}
