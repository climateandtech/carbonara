// == Non compliant Code Example

export default function KeepAwakeExample() {
  useKeepAwake(); // Non compliant
  // ruleid: gci505-javascript-idleness-keep-screen-on-addflags
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>This screen will never sleep!</Text>
    </View>
  );
}

_activate = () => {
  // ruleid: gci505-javascript-idleness-keep-screen-on-addflags
    activateKeepAwake(); // Noncompliant
    alert('Activated!');
  };

// == Compliant Solution

// ok: gci505-javascript-idleness-keep-screen-on-addflags
export default function KeepAwakeExampleCompliant() {
  // No screen-awake calls
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>This screen will sleep!</Text>
    </View>
  );
}
