import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
import database

patients = database.get_active_pending_patients()

import json
from bson import json_util
print(json.dumps(patients, default=json_util.default, indent=2))
