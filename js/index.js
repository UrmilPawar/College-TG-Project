document.getElementById("uploadForm").addEventListener("submit", function(event) {
    event.preventDefault();

    let fileInput = document.getElementById("excel");
    let dbName = document.getElementById("dbName"); // Assuming there's an input for DB name
    
    let file = fileInput.files[0]; // reads the 1st file uploaded
    let reader = new FileReader(); // FileReader is a built-in JavaScript object that helps read file contents.

    reader.onload = function() {   // reader.onload is an event listener that runs when the file is fully loaded into memory
        let base64File = reader.result.split(",")[1]; // Removes metadata (reader.result contains the full Base64 string)

        let requestData = {
            name: dbName.value.trim(),
            file: base64File
        };

        //storing the dbnam to localstorge so that filter.js can fetch
        let trimmedDbName = dbName.value.trim();
        localStorage.setItem("dbName", trimmedDbName);

        fetch("http://127.0.0.1:5000/creation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestData)
        })
        .then(response => response.json()) // Convert response to JSON
        .then(result => {
            document.getElementById("message").innerText = result.message || result.error;

            if (result.message) { 
                // If successful, redirect to a new page
                window.location.href = "filter.html";  // Change to the filter page
            }
        })
        .catch(error => {
            console.error("Error:", error);
            document.getElementById("message").innerText = "Upload failed!";
        });
    };

    reader.readAsDataURL(file); // This starts the file reading process. Convert file to Base64 (Once the file is fully read, reader.onload is triggered)
});








































// document.getElementById("uploadForm").addEventListener("submit", function(event) {
//     event.preventDefault();

//     let fileInput = document.getElementById("fileInput");

//     //FormData - JavaScript object that allows to easily send form data (including files) in an HTTP request instead of manually building a request body
//     let formData = new FormData(); 
//     formData.append("excelFile", fileInput.files[0]);

//     fetch("http://127.0.0.1:5000/creation", {
//         method: "POST",
//         body: formData
//     })
//     .then(response => response.json())  // Convert response to JSON
//     .then(result => {
//         document.getElementById("responseMessage").innerText = result.message;
//     })
//     .catch(error => {
//         console.error("Error:", error);
//         document.getElementById("responseMessage").innerText = "Upload failed!";
//     });
// });
