import pandas as pd     #Used for manipulating acquired excel file
import mysql.connector
import base64           # Used to decode the Base64-encoded Excel file as the excel file cannot be transferred directly using JSON
from flask import Flask, request, jsonify
from sqlalchemy import create_engine   # Helps interact with MySQL using Pandas
from io import BytesIO  # Converts binary data into a file-like object
from flask_cors import CORS
import json
from sqlalchemy import text
from flask import send_file #allows to send file to the client to download

app = Flask(__name__)
CORS(app)

# MySQL Server Connection (No specific database yet)
DB_CONFIG = {
    "user": "root",
    "password": '',
    "host": "localhost"
}

#-------------------------------------------------Flask Route to create the database from given excel sheet------------------------------------------
def create_database(db_name):
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")  # Creates a new MySQL database and it doesnt gives error if it dont exist
    conn.commit()
    cursor.close()
    conn.close()

def read_database(query):
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    cursor.execute(query)  
    results = cursor.fetchall() 
    cursor.close()
    conn.close()
    return results 

@app.route("/creation", methods=["POST"])
def creation_server():
    try:
        data = request.get_json()
        
        # Extracting 'name' (database name) and 'file' (Base64 Excel)
        if "name" not in data or "file" not in data:
            return jsonify({"error": "Both 'name' and 'file' fields are required"}), 400
        db_name = data["name"].strip()
        file_data = data["file"]

        # Decoding the Base64 file
        file_bytes = base64.b64decode(file_data)   #this line decodes that Base64 excel string back into raw binary (bytes), which is original excel file
        file_obj = BytesIO(file_bytes)    #BytesIO(file_bytes) Creates a file-like object from the binary Excel file (so Pandas can read it).
        excel_data = pd.ExcelFile(file_obj)  # pd.ExcelFile(...): Loads the Excel file into memory, allowing us to extract sheets.

        # Creating database dynamically
        create_database(db_name)

        # Creating new engine for the specific database
        engine = create_engine(f"mysql+mysqlconnector://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}/{db_name}")
        
        #Iterating through the sheets and string them as tables
        for sheet_name in excel_data.sheet_names:
            df = excel_data.parse(sheet_name)  #Reads one sheet from the Excel file into a Pandas DataFrame
            df.to_sql(sheet_name.lower(), con=engine, if_exists="replace", index=False) #Saves the DataFrame (df) as a table in MySQL. 
            #.lower() is necessary otherwise UserWarning: The provided table name 'Teacher_Guardian' is not found exactly as such in the database after writing the table will come

        return jsonify({"message": f"Excel file processed successfully! Data stored in `{db_name}` database."})

    except Exception as e:   #used for getting a structured error message rarther than just- Internal server error
        return jsonify({"error": str(e)}), 500

#-----------------------------------------------Flask Route to Retrieve and Categorize Data-------------------------------------------------
@app.route("/categorize", methods=["POST"])
def categorization_server():
    try:
        data = request.get_json()

        # Validating the presence of required fields
        if "name" not in data:
            return jsonify({"error": "'name' (database) field is required"}), 400

        db_name = data["name"].strip()

        # Creating new engine for the specific database
        engine = create_engine(f"mysql+mysqlconnector://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}/{db_name}")

        query = f"SHOW TABLES FROM `{db_name}`;"

        result =   read_database(query)  # result is obtained as [('ise1',), ('teacher_guardian',)]
        
        #Extracting the tables names from result
        tables=[]
        for element in result:
            tables.append(element[0])

        # Dictionary to store deatils of tables and their columns
        database_metadata = {}

        for table in tables:     # for every table in database
            with engine.connect() as connection:    # establish connection (without this "AttributeError: 'OptionEngine' object has no attribute 'execute'" will occur)
                df = pd.read_sql(text(f"SELECT * FROM {table}"), con=connection)   # Read table into DataFrame
            # print(df.head())
            
            #Dictionary to store deatils of all column of a specific table
            column_details = {}

            for col in df.columns:
                if pd.api.types.is_numeric_dtype(df[col]):  
                    column_details[col] = {
                        "type": "numerical",
                        "min": float(df[col].min()),  # df[col].min() and df[col].max() return NumPy types (int64, float64), which are not JSON serializable.
                        "max": float(df[col].max())   # Converting them to float ensures they can be properly converted to JSON.
                    }
                else:
                    column_details[col] = {
                        "type": "categorical",
                        "values": df[col].dropna().unique().tolist()  # List of unique values
                    }

            database_metadata[table] = column_details  #storing column details with respect to every table
        
        return jsonify({
            "database_metadata": database_metadata
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

#-----------------------------------------------Flask Route to return filtered data-------------------------------------------------
@app.route("/filteration",methods=["POST"])
def filteration_server():
    try:
        #--------------------------Receiving data from client----------------
        data = request.get_json()
        db_name = data.pop("_dbName") ## Removing and storing _dbName
        combine_logic = data.pop("_combineLogic", "OR").upper()  # Retriving the combine logic (with OR as default)
        
        #--------------------------Building the query------------------------
        
        tables = list(data.keys()) # extracting the table (sheet) names and storing them as list
        base_table = tables[0] #choosing any one as base table
        # JOIN clause
        joins = []               # for storing the strings of join clause
        for table in tables[1:]: # for every table after index 0
            joins.append(f"JOIN {table} ON {table}.ID = {base_table}.ID")  # Joining that table with the base table uisng ID column

        # WHERE conditions
        conditions = []          # list for storing all the where clause strings

        for table, fields in data.items():              # looping through each table-feilds (table-columns) pair
            for column, value in fields.items():        # looping through every column-values pair /  The body of the loop won't run if feilds is empty = {}
                if isinstance(value, list):             # if value is list (Categorical)
                    vals = ', '.join(f"'{v}'" for v in value)        # creating string of all options : 'DC', 'CSS'
                    conditions.append(f"{table}.`{column}` IN ({vals})")  # Sheet1.subject IN ('DC', 'CSS')
                elif isinstance(value, dict):  # if value is Numerical
                    # conditions.append(f"{table}.`{column}` = {value}")  # Sheet1.marks = 25
                    op = value["op"]
                    val = value["value"]
                    conditions.append(f"{table}.`{column}` {op} {val}")

        # Final SQL query
        query = f"SELECT * FROM {base_table} "
        if joins:
            query += " ".join(joins)  # joining all the JOIN string using " "
        if conditions:
            query += " WHERE " + f" {combine_logic} ".join(conditions) #joining all conditions with AND in between and place 'WHERE' ahead of them
        
        print(query)
            
        #--------------------------Reading data from database using built query and converting it to excel------------------------
        engine = create_engine(f"mysql+mysqlconnector://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}/{db_name}")
        
        with engine.connect() as connection:
            df = pd.read_sql(text(query), con=connection) #Storing the result in dataframe
            
        # df = df.loc[:, ~df.columns.duplicated()] # Removes the column with duplicate names

        MAX_ROWS = 100000
        # Prevent memory overflow by limiting large results
        if len(df) > MAX_ROWS:
            # You can either abort or truncate the data
            return jsonify({
                "error": f"Too many rows ({len(df)}). Limit is {MAX_ROWS}."
            }), 400  # 400 = client-side error (Payload Too Large)
            
        # Converting DataFrame to an Excel file (but keeping it in memory, not saving on disk)
        output = BytesIO()  #creates a file in memory (not in disk)
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer: # is like opening Excel
            df.to_excel(writer, index=False, sheet_name='FilteredData') #writes data into that file.
        output.seek(0) #moves the "cursor" to the beginning of that file so we can read/send it.

        #--------------------------Returing the excel file---------------------------
        return send_file(
            output, #the file we're sending
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', #This tells the browser: this is an Excel file (.xlsx)
            download_name='filtered_result.xlsx', #sets the name of the file when it’s downloaded.
            as_attachment=True #This tells Flask: not to open it in the browser — force a download. (Without it, the browser might try to display the file instead of downloading it.)
        )

    except Exception as e:
        return jsonify({"error":str(e)}),500

@app.route("/deletion",methods=["POST"])
def deletion_server():
    try:
        data=request.get_json()
        db_name = data["dbName"].strip()
        
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(f"DROP database `{db_name}`")  # Drops the database
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Database dropped successfully"})
        
    except Exception as e:
        return jsonify({"error":str(e)}),500

if __name__ == "__main__":
    app.run(debug=True)