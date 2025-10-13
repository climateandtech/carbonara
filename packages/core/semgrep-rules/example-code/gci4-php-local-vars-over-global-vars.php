# Non-compliant examples
var aGlobal = new String('Hello');

function globalLength(){
    length = aGlobal.length;
    console.log(length);
}

globalLength();


# Compliant solutions
var aGlobal = new String('Hello');

function someVarLength(str){
    length = str.length;
    console.log(length);
}

somVarLength(aGlobal);
