
// function to properly align and butify the JSON database data received through /categorize
function render_response(response) {
    const formContainer = document.getElementById("formContainer");

    // for every sheet
    for (let sheetName in response) {
        const sheetData = response[sheetName];    //retriving the sheet's value (data)

        const sheetTitle = document.createElement("h2");
        sheetTitle.className = "mt-4 mb-3 text-primary";
        sheetTitle.textContent = `Sheet: ${sheetName}`;
        formContainer.appendChild(sheetTitle);

        for (let field in sheetData) {          // for every feile (key) in that sheet
            const fieldData = sheetData[field]; // retriving that feild value

            const fieldDiv = document.createElement("div");   //creating div for that feild
            fieldDiv.className = "mb-4 border p-3 rounded shadow-sm bg-light";

            const label = document.createElement("label");  //creating label for the feild
            label.textContent = field;
            label.className = "form-label fw-bold";
            fieldDiv.appendChild(label);

            // if feild is categorical
            if (fieldData.type === "categorical") {
                const checkboxContainer = document.createElement("div");
                checkboxContainer.className = "d-flex flex-wrap gap-3 mt-2";  // making the checkbox container a flexbox using d-flex (it will hold every checkbox inside that feild)

                fieldData.values.forEach(value => {     // for each categorial value in that felid's array
                    const checkboxDiv = document.createElement("div"); //creating the division of that checkbox
                    checkboxDiv.className = "form-check";

                    const checkbox = document.createElement("input"); //defining input feild
                    checkbox.type = "checkbox";
                    checkbox.name = `${sheetName}-${field}`; //will be used to determine sheetname when form will be submitted
                    checkbox.value = value;
                    checkbox.className = "form-check-input";
                    checkbox.id = `${sheetName}-${field}-${value}`;

                    const cbLabel = document.createElement("label"); //defining label
                    cbLabel.textContent = value;
                    cbLabel.className = "form-check-label";
                    cbLabel.htmlFor = checkbox.id;


                    checkboxDiv.appendChild(checkbox);
                    checkboxDiv.appendChild(cbLabel);
                    checkboxContainer.appendChild(checkboxDiv);
                });
                fieldDiv.appendChild(checkboxContainer);
            }

            // Handle numerical fields
            else if (fieldData.type === "numerical") {
                const min = fieldData.min;
                const max = fieldData.max;

                const rangeText = document.createElement("p"); // for Specifying the text of the numerical input
                rangeText.textContent = `Range: ${min} to ${max}`;
                rangeText.className = "text-muted";  // making the text a little dim

                const inputGroup = document.createElement("div");  // for holding the actual inputs (numerical+operator)
                inputGroup.className = "input-group";
            
                const operatorSelect = document.createElement("select"); // to select the operators
                operatorSelect.className = "form-select";
                operatorSelect.name = `${sheetName}-${field}-op`;
                operators = ["=", ">", "<", ">=", "<="]

                operators.forEach(op => {
                    const option = document.createElement("option");
                    option.value = op;
                    option.textContent = op;
                    operatorSelect.appendChild(option);
                });

                const input = document.createElement("input");  // for electing the numerical value
                input.type = "number";
                input.name = `${sheetName}-${field}`; //will be used to determine sheetname when form will be submitted
                input.min = min;
                input.max = max;
                input.placeholder = `Enter value between ${min} and ${max}`;
                input.className = "form-control";

                inputGroup.appendChild(operatorSelect);
                inputGroup.appendChild(input);

                fieldDiv.appendChild(rangeText);
                fieldDiv.appendChild(inputGroup);
            }

            formContainer.appendChild(fieldDiv);
        }
    }
}

// Execution that happens when the HTML flile loads
document.addEventListener("DOMContentLoaded", function () {
    let dbName = localStorage.getItem("dbName"); // Retrieve database name stored earlier in index.js
    let response; // variable to store the database JSON content

    if (!dbName) {
        document.getElementById("nodb").innerText = "Database name not found!";
        return;  // Stop running the rest of the code (not possible to write 'return' outside any function)
    }
    
    //sending the request to the server
    fetch("http://127.0.0.1:5000/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: dbName }) // Sending the database name to the server
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            document.getElementById("metadata").innerText = "Error: " + result.error;
        } else {
            // document.getElementById("metadata").innerText = JSON.stringify(result.database_metadata);
            response = result.database_metadata;
            render_response(response);  //calling the function to align and butify
        }
    })
    .catch(error => {
        console.error("Error:", error);
        document.getElementById("metadata").innerText = "Failed to fetch metadata!";
    });
  
});


// Execution to happen when the filter-form will be submitted 
document.getElementById("filterForm").addEventListener("submit", function (e) {
    e.preventDefault(); // Preventing page reload

    const formData = {};   // will store all the selected/entered form data grouped by sheet name.
    const formElements = document.querySelectorAll("#formContainer input");  //grabs all <input> elements inside the #formContainer

    formElements.forEach(input => {  //for each input element
        const [sheet, field] = input.name.split("-"); //extractig sheet name and feild

        if (!formData[sheet]) {  //If this sheet doesn’t exist in the final object yet, we create it.
            formData[sheet] = {};
        }

        if (input.type === "checkbox") { // if input is checkbox
            if (input.checked) {  // if it’s checked
                if (!formData[sheet][field]) {  // if list to hold the checkbox values for the feild don't exist
                    formData[sheet][field] = [];
                }
                formData[sheet][field].push(input.value);
            }
        } else if (input.type === "number" && input.value) {  //if it’s a number input and it has a value (This ensures only filled number fields are added.)
            // formData[sheet][field] = parseFloat(input.value);  //storing it as a number 
            const operator = document.querySelector(`select[name="${sheet}-${field}-op"]`);
            formData[sheet][field] = { op: operator, value: parseFloat(input.value) };
        }
    });

    //storig the dbName to make connection to required database
    let dbName = localStorage.getItem("dbName"); // Retrieve database name stored earlier in index.js
    formData["_dbName"] = dbName; // Using a reserved key to store the dbName so that it didnt get cofusd with the existing sheetnames (indicates metadat)

    // Appending selected combine logic (AND/OR)
    const combineLogic = document.querySelector('input[name="combineLogic"]:checked').value;
    formData["_combineLogic"] = combineLogic;

    console.log(formData);

    // Send data to the filteration server to receive the filtered data
    fetch("http://127.0.0.1:5000/filteration", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
    })
    .then(response => {
        //code to handle the max line limit error (here we do not check response.error becaue for that it need to be parsed first and here our returned data is file)
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.error || "Unknown error from server");
            });
        }
        return response.blob();  // Convert response into a Blob, which is basically a downloadable binary file.
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob); // creates a link to download that file.
        const a = document.createElement('a'); // creating a fake <a> (anchor) tag
        a.href = url;
        a.download = "filtered_result.xlsx"; // Naming the downloaded file as filtered_result.xlsx
        document.body.appendChild(a); //telling the <a> tag: When someone clicks this link, download from this URL
        a.click(); //This simulates a click on the link → so the browser thinks clicked Download.
        a.remove(); // Cleaning up the <a> tag
    })
    .catch(err => {
        console.error("Error:", err);
        alert("Failed to submit form.");
    });
});


document.getElementById("exit").addEventListener('click',function() {
        let dbName = localStorage.getItem("dbName");
        //sending the request to the server
        fetch("http://127.0.0.1:5000/deletion", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({dbName:dbName})
        })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                alert(result.error);
            } else {
                alert (result.message);
                window.location.href = "thankyou.html"
            }
        })
        .catch(error => {
            console.error("Error:", error);
        });
})

