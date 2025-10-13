List<String> objList = getData();

for (int i = 0; i < objList.size(); i++) {  // Noncompliant
    // execute code
}


List<String> objList = getData();

int size = objList.size();
for (int i = 0; i < size; i++) {
    // execute code
}