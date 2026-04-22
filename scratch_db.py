from pymongo import MongoClient

MONGO_URI="mongodb+srv://hms_user:strongpassword123@hms-cluster.y4grcdf.mongodb.net/hospital_db"
client = MongoClient(MONGO_URI)
db = client.hospital_db
patients = list(db.patients.find({}))
visits = list(db.visits.find({}))

import json
from bson import json_util
print(json.dumps({"patients": patients, "visits": visits}, default=json_util.default, indent=2))
