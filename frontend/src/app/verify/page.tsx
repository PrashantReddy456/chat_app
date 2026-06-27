"use client"

import Loading from "@/src/components/Loading"
import VerifyOtp from "@/src/components/verifyOtp"
import { Suspense } from "react"


const VerifyContent = () => {



    return (
        <Suspense fallback={<Loading />}>
            <div><VerifyOtp /></div>
        </Suspense>
    )
}



export default VerifyContent