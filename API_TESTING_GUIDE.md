# HMS API Testing Guide (Swagger UI)

This document provides instructions on how to use the built-in Swagger UI sandbox to test the Hospital Management System (HMS) APIs effectively.

## Accessing the Swagger UI

Ensure the backend Docker container is running.
Navigate to the following URL in your web browser:
**[http://localhost:5000/api/docs](http://localhost:5000/api/docs)**

## 1. Authentication (JWT)

Most of the endpoints in the HMS system are protected and require a valid JSON Web Token (JWT) to access. If you try to execute a protected route without a token, you will receive a `401 Unauthorized` error.

### Step 1: Obtain an Access Token
1. In the Swagger UI, scroll down to the **Auth** section and click on the `POST /login` endpoint.
2. Click the **"Try it out"** button.
3. In the Request body, provide valid credentials. 
   * **CRITICAL NOTE ON PASSWORDS**: The HMS frontend architecture hashes passwords using SHA-256 *before* sending them to the backend API. Therefore, you cannot type a plaintext password (like `password123`) into Swagger. You must provide the **SHA-256 hex string** of your password. 
   * Example: If your password is `password123`, you must submit `ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f`. You can use any online SHA-256 generator to convert your password for testing.
4. Click **"Execute"**.
5. In the Server response section, look for the `access_token` field in the JSON response and copy its value.

### Step 2: Authorize Swagger UI
1. Scroll to the very top of the Swagger UI page and click the green **"Authorize"** button.
2. A modal will appear asking for a "bearerAuth" value.
3. Paste the `access_token` you copied in Step 1 into the `Value` text box.
4. Click **"Authorize"** and then **"Close"**.
5. Swagger will now automatically attach the `Authorization: Bearer <your_token>` header to all subsequent API requests.

## 2. Testing Endpoints

Endpoints are grouped by their respective categories (e.g., Patient, Lab, Inventory, Staff).

### Making a Request
1. Click on the endpoint you wish to test (e.g., `GET /patients`).
2. Click the **"Try it out"** button to unlock the input fields.
3. **Path Parameters:** If the endpoint URL has curly braces (e.g., `/get_patient/{institute_id}`), a dedicated text box will appear for you to enter the required ID.
4. **Request Body:** For `POST`, `PUT`, or `PATCH` requests, an editable JSON text area will appear. It is pre-filled with the expected keys (e.g., `institute_id`, `name`, `date_of_birth`). Replace the "string_value" dummy data with actual test data.
5. Click **"Execute"**.

## 3. Interpreting Responses

After clicking Execute, scroll down to the **Responses** block to see the result:
* **Curl:** The exact terminal command you can run to replicate the request.
* **Request URL:** The exact URL that was hit.
* **Server response:** 
  * **Code 200:** Successful operation. The response body will contain your requested data.
  * **Code 400:** Bad Request. You may have missed a required parameter or provided invalid data types. Check your JSON body.
  * **Code 401:** Unauthorized. Your token has expired, or you forgot to add it via the "Authorize" button at the top of the page.
  * **Code 500:** Internal Server Error. Check the backend Docker logs (`docker compose logs -f backend`) for the python stack trace.

## 4. Re-generating Swagger Documentation

The `swagger.json` file dictates what appears on the Swagger UI page. If you add new routes to the Flask application, you need to update the Swagger specification.

A helper python script has been created to automatically parse the route files and re-generate the JSON spec:
```bash
python backend/generate_swagger.py
```
This script scans all blueprints, infers path parameters, extracts required JSON payload keys, maps JWT requirements, and outputs a comprehensive `backend/app/static/swagger.json` file. You should run this script whenever you create a new endpoint or modify an existing one's parameters.
