import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import * as Brightness from 'expo-brightness';

export default function AppNonCompliant() {
    useEffect(() => {
        // ruleid: gci522-javascript-sobriety-brightness-override
        (async () => { Brightness.setSystemBrightnessAsyn(1); })(); // Brightness is forced here
    }, []);
    return (
        <View>
            <Text>Brightness Module Example</Text>
        </View>
    );
}

// ok: gci522-javascript-sobriety-brightness-override
export default function AppCompliant() {
    useEffect(() => {
        // No brightness override
    }, []);
    return (
        <View>
            <Text>Brightness Module Example</Text>
        </View>
    );
}
