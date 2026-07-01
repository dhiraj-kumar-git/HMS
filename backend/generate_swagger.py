import os
import re
import json

base_dir = r'c:\Users\Dhiraj\Desktop\TA_Project\HMS\backend\app\routes'
routes = {}

def extract_json_fields(func_body):
    # Find all data.get('field') or request.json.get('field')
    fields = re.findall(r'get\([\'\"]([\w_]+)[\'\"]\)', func_body)
    # Also find data['field']
    fields += re.findall(r'\[[\'\"]([\w_]+)[\'\"]\]', func_body)
    # Remove duplicates but preserve some order
    return list(dict.fromkeys(fields))

for filename in os.listdir(base_dir):
    if not filename.endswith('.py') or filename == '__init__.py':
        continue
    filepath = os.path.join(base_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We need to split the file by routes to inspect the function bodies
    route_splits = re.split(r'(@[\w_]+\.route)', content)
    
    for i in range(1, len(route_splits)-1, 2):
        decorator = route_splits[i]
        route_body = route_splits[i+1]
        
        # Parse path and methods
        route_def_match = re.search(r"\(\s*['\"]([^'\"]+)['\"]\s*(?:,\s*methods=\[([^\]]+)\])?", route_body)
        if not route_def_match:
            continue
            
        raw_path = route_def_match.group(1)
        methods_str = route_def_match.group(2)
        
        if not methods_str:
            methods = ['GET']
        else:
            methods = [m.strip('\"\' ') for m in methods_str.split(',')]
            
        # Parse flask path params <id> or <string:id>
        path_params = re.findall(r'<([^>]+)>', raw_path)
        swagger_path = raw_path
        
        swagger_params = []
        for param in path_params:
            param_name = param.split(':')[-1]
            swagger_path = swagger_path.replace(f'<{param}>', f'{{{param_name}}}')
            swagger_params.append({
                'name': param_name,
                'in': 'path',
                'required': True,
                'schema': {'type': 'string'}
            })
            
        if swagger_path not in routes:
            routes[swagger_path] = {}
            
        for method in methods:
            method_lower = method.lower()
            tag = filename.replace('_routes.py', '').title()
            
            op_obj = {
                'tags': [tag],
                'summary': f'{tag} - {swagger_path}',
                'responses': {
                    '200': {'description': 'Successful Operation'},
                    '400': {'description': 'Bad Request'},
                    '401': {'description': 'Unauthorized'}
                }
            }
            
            # Check for @jwt_required() in the body
            if '@jwt_required' in route_body:
                op_obj['security'] = [{'bearerAuth': []}]
            elif '/login' in swagger_path:
                pass 
                
            if swagger_params:
                op_obj['parameters'] = swagger_params
                
            if method_lower in ['post', 'put', 'patch']:
                fields = extract_json_fields(route_body)
                example = {f: 'string_value' for f in fields}
                # override some common types
                for f in example:
                    if 'id' in f: example[f] = 123
                    if 'age' in f: example[f] = 30
                    if 'password' in f: example[f] = 'password123'
                    if 'username' in f: example[f] = 'admin'
                    
                op_obj['requestBody'] = {
                    'content': {
                        'application/json': {
                            'schema': {'type': 'object'},
                            'example': example
                        }
                    }
                }
            
            routes[swagger_path][method_lower] = op_obj

swagger = {
  'openapi': '3.0.0',
  'info': {
    'title': 'HMS API Testing Sandbox',
    'version': '1.0.0'
  },
  'components': {
    'securitySchemes': {
      'bearerAuth': {
        'type': 'http',
        'scheme': 'bearer',
        'bearerFormat': 'JWT'
      }
    }
  },
  'security': [{'bearerAuth': []}],
  'paths': routes
}

out_path = r'c:\Users\Dhiraj\Desktop\TA_Project\HMS\backend\app\static\swagger.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(swagger, f, indent=2)

print(f'Generated swagger with {len(routes)} paths, auth enabled, and body parsed.')
