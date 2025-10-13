// Non-compliant examples
Url url = new Url("https://www.green-code-initiative.io/");
HttpsUrlConnection con = (HttpsURLConnection) url.openConnection();
OutputStream stream = con.getOutputStream();

Url url = new Url("https://www.green-code-initiative.io/");
HttpsUrlConnection con = (HttpsURLConnection) url.openConnection();
OutputStream stream = new GZIPOutputStream(con.getOutputStream());
