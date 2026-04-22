import pandas as pd
import json

# Specify the path to the Excel file
excel_file = "D:/HMS_rana/HMS_rana/HMS/backend/Stock reports March 2025.xlsx"

# Read the Excel file into a DataFrame.
# Ensure that the Excel file has headers named 'item_id' and 'item_name'.
df = pd.read_excel(excel_file)

# Convert the DataFrame to a list of dictionaries
data = df.to_dict(orient="records")

# Write the resulting list to a JSON file with pretty printing.
with open("config.json", "w") as json_file:
    json.dump(data, json_file, indent=4)

print("JSON configuration file 'config.json' created successfully!")
